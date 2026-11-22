# Plan Mode — database (2026-09-17)

Cobre 3 achados **P0** da reavaliação `diagnostico-constituicao-backend-2026-09-16.md` (executada em
2026-09-17) que são, na essência, problemas de banco de dados (concorrência de transação, seleção de
credencial de migration, reversibilidade de migration) — fora do escopo de
`planmode-database-2026-09-16.md` (Rodadas 1-4), que fechou schema/role/índice/CI mas não tocou
`auth.py`/`config.py`/a migration `f8fe7ce9347c`. Formato conforme
`padroes/database/constituicao_database.md` Seção 2. Os três achados foram confirmados presentes no
código atual antes de escrever este plano (não apenas herdados do texto do diagnóstico).

## Bloco 1 — rotação/revogação atômica de refresh token (P0)

**Objetivo**: `rotate_refresh_token` e `revoke_refresh_token` (`backend/app/auth.py:90-113` e
`143-153`) fazem `SELECT` + mutação de atributo + `commit()` final — duas requisições concorrentes
com o mesmo token passam ambas pela checagem `revoked_at is None` antes de qualquer commit, gerando
dois sucessores do mesmo token pai. Quebra a premissa "reuso de token revogado = furto de sessão" de
que o Bloco 2 do Plan Mode de segurança (já implementado) depende. Motivo: constituição Seção 5
("nível de isolamento explícito quando o padrão do banco não é suficiente... evitar race condition
em contagem/saldo concorrente" — aqui o "saldo" é o estado de revogação).

**Decisão de design**: `UPDATE refresh_token SET revoked_at = :agora WHERE token_hash = :hash AND
revoked_at IS NULL RETURNING user_id` atômico, não `SELECT ... FOR UPDATE`. Um único `UPDATE` já é
atômico no Postgres — a transação concorrente bloqueia na mesma linha até a primeira commitar e, ao
reavaliar o `WHERE`, encontra `revoked_at` já preenchido e afeta 0 linhas. Mesma garantia do
`FOR UPDATE`, um round-trip a menos, sem lock explícito, mantendo o padrão SQLAlchemy Core já usado
no arquivo (troca `select(...)` por `update(...).values(...).returning(...)`).

**Modelagem**: nenhuma coluna nova. `revoked_at` e `token_hash` (já `UNIQUE`) cobrem a garantia
necessária.

**Migração**: nenhuma — mudança é só em `backend/app/auth.py`, schema de `refresh_token` inalterado.

**Performance**: nenhuma mudança de índice necessária — o `UPDATE` já usa `token_hash` (índice único
existente) no `WHERE`; volume por sessão é baixo.

**Riscos**: baixo. `rotate_refresh_token` passa a distinguir só "sucesso" vs. "não achou linha
elegível" (token inexistente, já revogado ou expirado colapsam no mesmo 401, igual ao comportamento
atual). O `RETURNING` traz `user_id` (não o objeto `User`), preservando a validação de
`status`/`deleted_at` que já existe depois. Cobrir com teste de concorrência real (duas conexões,
mesmo token, uma das duas precisa falhar) além do teste de caso feliz já existente.

**Arquivos de contexto a atualizar**: nenhum — contrato HTTP de `/auth/refresh` e `/auth/logout` não
muda, só a implementação interna.

**Arquivos/scripts/código a excluir**: nenhum.

## Bloco 2 — precedência explícita de `DATABASE_URL` de processo sobre `DATABASE_URL_MIGRATION` de `.env` (P0)

**Objetivo**: `database_url_alembic` (`backend/app/config.py:98-110`) sempre prioriza
`database_url_migration` quando definida, mesmo quando o operador exporta `DATABASE_URL=...` na
própria linha de comando para uma execução pontual — causou incidente real (`alembic upgrade head`
pensado para Postgres local atingiu o Neon porque `.env` local tinha `DATABASE_URL_MIGRATION`
setado, Bloco 1 do Plan Mode de database anterior). Não é bug de separação de role (Bloco 1/4
daquele plano são intencionais e permanecem) — é ausência de uma via de override explícita para uso
pontual em dev.

**Decisão de design**: `database_url_alembic` passa a checar `os.environ.get("DATABASE_URL")`
(ambiente real do processo, não o valor já mesclado pelo `pydantic-settings`) antes de olhar
`database_url_migration`: se a variável foi exportada no shell/no `env:` do job, ela vence. Funciona
porque `SettingsConfigDict(env_file=".env")` não grava o `.env` em `os.environ` — só mescla
internamente no objeto `Settings`. Logo `os.environ["DATABASE_URL"]` só existe quando alguém
exportou de verdade (o caso do incidente) ou quando um workflow define `env:` no job — caso de
`.github/workflows/migrar_banco.yml:21`, que já seta `DATABASE_URL` (nunca `DATABASE_URL_MIGRATION`)
e continua funcionando sem mudança. Descartada a alternativa de exigir confirmação de host antes de
`upgrade`/`downgrade`: resolveria o sintoma mas adiciona fricção permanente em todo comando
(inclusive os legítimos) para um problema cuja causa raiz é só prioridade errada entre duas fontes.

**Modelagem**: nenhuma.

**Migração**: nenhuma migration de schema — mudança em `backend/app/config.py`
(`database_url_alembic`) e, para visibilidade, `backend/alembic/env.py` passa a imprimir (stderr) o
host resolvido da URL final antes de rodar, sempre, independente do comando (eco informativo, não
gate).

**Performance**: nenhuma.

**Riscos**: baixo, mas exige teste dos 3 cenários — (1) nem `DATABASE_URL` nem
`DATABASE_URL_MIGRATION` no ambiente real, só `.env`: comportamento atual preservado
(`DATABASE_URL_MIGRATION` do `.env` vence, como hoje); (2) `DATABASE_URL` exportado no shell +
`DATABASE_URL_MIGRATION` só no `.env`: `DATABASE_URL` exportado vence (corrige o incidente); (3)
`migrar_banco.yml`: `DATABASE_URL` setado no `env:` do job vence — idêntico ao comportamento atual,
sem regressão. Adicionar teste do cenário 2 em `backend/tests/test_config.py` (hoje só o cenário 1
está coberto, `test_url_do_alembic_usa_database_url_migration_quando_definida`).

**Arquivos de contexto a atualizar**: `backend/README.md`/`README.md`, se documentarem hoje o uso de
`DATABASE_URL=... alembic upgrade head` para override local — acrescentar nota de que o export
explícito no shell agora vence sobre `DATABASE_URL_MIGRATION` do `.env` para o Alembic.

**Arquivos/scripts/código a excluir**: nenhum.

## Bloco 3 — corrigir `downgrade()` de `f8fe7ce9347c` para não quebrar em banco populado (P0)

**Objetivo**: `downgrade()` (`backend/alembic/versions/f8fe7ce9347c_remove_cpf_hash_contrato_morto.py:35-39`)
recria `cpf_hash` como `NOT NULL` sem `server_default` — falha com `ADD COLUMN` em qualquer `user`
com linha existente (produção tem). Migration autogerada, nunca ajustada manualmente. Motivo:
constituição Seção 4 ("nova coluna `NOT NULL` sem default em tabela com linhas" é exatamente o caso
que a Seção 2 ("Migração" do Plan Mode) pede para avaliar antes de aprovar).

**Decisão de design**: `server_default=sa.text("'nao-informado'")` no `add_column` do `downgrade`,
mantendo `NOT NULL` — não tornar a coluna `nullable`. O schema original (antes de `f8fe7ce9347c`)
era `NOT NULL` com esse sentinela como único valor real já confirmado (`SELECT DISTINCT cpf_hash
FROM "user"`, citado no próprio docstring da migration — nunca CPF real, conforme já registrado em
`CLAUDE.md`); `nullable=True` reintroduziria um schema que nunca existiu de fato em produção.
`server_default` reproduz fielmente o estado histórico e cumpre a exigência de rollback "sempre
possível" sem exigir restore de backup (o dado morto era 100% sentinela, não há dado real a
recuperar) — documentar isso no próprio docstring do `downgrade`.

**Modelagem**: nenhuma mudança no schema atual (`upgrade` já aplicado e correto) — só o `downgrade`
ganha `server_default` na `op.add_column`.

**Migração**: não é uma migration nova — é correção do arquivo já existente. Como essa migration já
foi aplicada, a proibição da Seção 4 ("editar migração já aplicada em ambiente compartilhado") se
aplica ao `upgrade()`, não ao `downgrade()`: o `downgrade` nunca rodou em nenhum ambiente
compartilhado (é o caminho quebrado, nunca exercido) — corrigir o arquivo existente é seguro aqui,
não requer migration corretiva separada.

**Performance**: nenhuma — `ADD COLUMN ... NOT NULL DEFAULT` constante é metadata-only no Postgres
moderno (≥11), sem reescrita de tabela.

**Riscos**: baixo. Validar com `alembic downgrade -1` a partir do head contra clone local populado
antes de considerar fechado (provavelmente nunca testado, já que o bug só aparece com `NOT NULL` sem
default). Sem risco de perda de dado adicional (coluna já era morta).

**Arquivos de contexto a atualizar**: nenhum — não é entidade documentada em
`docs/database/modelo_er.mermaid` (já removida corretamente de lá quando o `upgrade` foi aplicado).

**Arquivos/scripts/código a excluir**: nenhum.

## Ordem de execução recomendada

1. Bloco 3 (correção pontual de arquivo já mergeado, zero dependência, destrava testar `downgrade`
   com segurança antes de qualquer outra mudança tocar a cadeia de migrations).
2. Bloco 1 (`auth.py`) — isolado, sem dependência de schema, mas é o P0 de maior impacto de segurança
   de sessão.
3. Bloco 2 (`config.py`/`env.py`) — mudança mais sensível a testar em 3 cenários; por último para não
   misturar validação com os outros dois blocos.

Implementação segue item a item, após aprovação explícita — nenhum código foi alterado nesta
entrega do Plan Mode.

---

# Implementação (2026-09-17, mesma sessão)

Os 3 blocos foram aplicados na ordem recomendada:

**Bloco 3** (`downgrade()` de `f8fe7ce9347c`): `op.add_column` do `downgrade` ganhou
`server_default=sa.text("'nao-informado'")`, mantendo `nullable=False`. Validado contra
`par_equipamentos_pytest` (clone local): `alembic upgrade head` até o head atual, `INSERT` de um
`user` real, `alembic downgrade -1` sem erro (antes falhava com `NotNullViolation`), `cpf_hash`
recuperado como `'nao-informado'`, `alembic upgrade head` de volta simétrico.

**Bloco 1** (`auth.py`): `rotate_refresh_token`/`revoke_refresh_token` trocaram `SELECT` + atribuição
+ `commit()` por `UPDATE refresh_token SET revoked_at = :agora WHERE token_hash = :hash AND
revoked_at IS NULL RETURNING user_id, expires_at` atômico. Caminho de erro faz `db.rollback()`
explícito (a `UPDATE` já enviada à conexão não pode persistir se a validação de expiração/usuário
falhar depois). Teste novo de concorrência real
(`tests/test_auth_session.py::test_rotacao_concorrente_do_mesmo_token_so_uma_vence`, duas `Session`/
conexões distintas via `ThreadPoolExecutor`, mesmo token) confirma que só uma das duas chamadas
concorrentes sucede.

**Bloco 2** (`config.py`/`env.py`): `database_url_alembic` passou a checar
`os.environ.get("DATABASE_URL")` antes de `database_url_migration`. `backend/alembic/env.py` ecoa
(stderr, sempre, informativo) o host resolvido antes de rodar qualquer comando. Teste novo
`tests/test_config.py::test_url_do_alembic_prioriza_database_url_exportada_no_processo` cobre o
cenário 2 (exportada no shell vence sobre `.env`); os testes existentes ganharam a fixture
`sem_database_url_no_ambiente` para não dependerem de o processo de teste não ter `DATABASE_URL` real
no ambiente. `.github/workflows/migrar_banco.yml` (cenário 3) conferido sem mudança de comportamento
— já seta `DATABASE_URL` (não `DATABASE_URL_MIGRATION`) no `env:` do job, que continua vencendo do
mesmo jeito.

**Validado**: `uv run pytest -m "not db"` (48 passed) e `uv run pytest -m db` contra
`par_equipamentos_pytest` local (63 passed, 8 skipped) sem regressão, incluindo os 2 testes novos.

**Arquivos de contexto atualizados**: `backend/README.md` (nota sobre a precedência nova de
`DATABASE_URL` exportado sobre `DATABASE_URL_MIGRATION`, na seção que já documentava
`DATABASE_URL=... alembic upgrade head` para override local) e `CLAUDE.md` (seção "Dois roles no
Neon" com a precedência nova; seção "Bloco 2 — sessão via cookie HttpOnly" com a rotação/revogação
atômica).

**Arquivos/scripts/código excluídos**: nenhum — confirmado nos 3 blocos que não havia código morto a
remover (a mudança troca a implementação interna das funções existentes, sem deixar caminho
alternativo/comentado para trás).
