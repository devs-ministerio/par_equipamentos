# Plan Mode — database (2026-09-16)

Terceira etapa do ciclo (`padroes/AGENTS.md` Seção 2.1) para a área database, depois de
`diagnostico-constituicao-database-2026-09-16.md` e
`avaliacao-diagnostico-database-2026-09-16.md`. Formato conforme
`padroes/database/constituicao_database.md` Seção 2. Cobre só o que resta em aberto — os 7
achados já aplicados em 2026-09-16 (commit único, `cnes_estabelecimento`, URL do Alembic,
`TEST_DATABASE_URL`, FK física de CNES, CHECKs, projeção/paginação) não são reabertos aqui; ficam
registrados no diagnóstico como drift histórico (correção sem Plan Mode formal precedente).

**Rodada 2 (2026-09-16, seção no final deste arquivo)**: o diagnóstico foi refeito com validação
direta no Neon (não mais só banco local) e trouxe achados novos de operação/segurança de conexão e
um drift de schema real (`refresh_token`). Os Itens 1, 2 e 4 abaixo (Rodada 1) permanecem como
histórico de execução; o Item 3 da Rodada 1 é encerrado nesta atualização — ver nota no próprio
item. Escopo de produção que antes ficava "fora deste plano" (SSL, privilégio, backup) volta a
entrar aqui porque a Rodada 2 comprovou os problemas contra o Neon real, não apenas presumiu — ver
seção "Rodada 2" mais abaixo.

## Item 1 — Teste de violação real para FK/CHECK/UNIQUE (Aplicado em 2026-09-17)

`backend/tests/test_integridade_constraints.py` (9 testes, `@pytest.mark.db`), registrado em
`_DB_TEST_MODULES` (`backend/tests/conftest.py`). Validado: `pytest -m db` (48 passed, 8 skipped,
mesma base de antes + 9 novos) e `pytest -m 'not db'` (43 passed) sem regressão.


**Objetivo**: fechar a exigência da Seção 9 da constituição ("constraint coberta por teste que
confirma que a violação é rejeitada pelo banco, não só pela aplicação"), hoje ausente. Motivo:
apontado como pendência pelo próprio diagnóstico e é o único item que impede fechar "cobertura de
teste de integridade" com nota alta.

**Modelagem**: nenhuma mudança de schema. Cobre os grupos já existentes — CHECKs de
não-negatividade/formato/intervalo (ex.: `ck_cnes_estabelecimento_cnes_formato`), FKs físicas de
CNES (`convenio`, `instrumento_equipamento`, `proposta_candidata`) e a UNIQUE de `nr_convenio`/
`email`/`numero`/`codigo`/`id_proposta`.

**Migração**: nenhuma. Só `backend/tests/test_integridade_constraints.py` novo, marcado `@pytest.mark.db`,
tentando inserir/atualizar valor inválido e afirmando `IntegrityError`/`DataError`.

**Performance**: nenhum impacto (roda contra banco descartável de teste).

**Riscos**: nenhum — leitura/escrita isolada em `TEST_DATABASE_URL`.

## Item 2 — Padronizar nomenclatura de índice/constraint (Aplicado em 2026-09-17)

Migration `9d2e13b1f93a` (rename de 13 `ix_`→`idx_`, 1 `ux_`→`uq_`, e 5 `UniqueConstraint`
nomeadas via `ALTER TABLE ... RENAME CONSTRAINT`, nomes autogerados confirmados via `pg_constraint`
antes de escrever a migration). `backend/app/db/models.py` atualizado nos mesmos 19 pontos.
Validado: `alembic upgrade head` / `downgrade -1` / `upgrade head` simétrico,
`pytest tests/test_schema_migrations.py -m db` (metadata bate com banco pós-rename).


**Objetivo**: a Seção 3 da constituição define `idx_<tabela>_<coluna(s)>` para índice e
`uq_<tabela>_<coluna(s)>` para unique. O inventário real tem três prefixos de índice coexistindo
(`idx_`, `ix_`, `ux_`) e 5 colunas com `unique=True` sem nome explícito (nome autogerado tipo
`usuarios_email_key`). Achado novo desta rodada de avaliação, não estava no diagnóstico original.

**Modelagem**: nenhuma entidade/coluna muda — só o nome físico de 13 índices `ix_*`→`idx_*`, 1
`ux_config_decision_key_vigente`→`uq_config_decision_key_vigente`, e nomeação explícita das 5
UNIQUE hoje implícitas (`usuarios.email`, `convenio.numero`, `marco_catalogo.codigo`,
`instrumento_equipamento.nr_convenio`, `proposta_candidata.id_proposta`).

**Migração**: uma migration aditiva de só `RENAME`/`ADD CONSTRAINT ... UNIQUE` nomeada — sem
`DROP`/recriação de dado, `down` faz o rename inverso. Checar antes se algum código
(scripts de auditoria, `ON CONFLICT` nomeado) referencia o nome físico atual antes de renomear.

**Performance**: nenhuma — rename de índice não reconstrói o índice no Postgres.

**Riscos**: baixo. Lock breve de metadata (`ALTER INDEX RENAME`/`ALTER TABLE RENAME CONSTRAINT`),
sem reescrita de tabela. Só quebra algo se um consumidor externo referenciar o nome físico da
constraint diretamente (não esperado; validar com grep antes de aplicar).

## Item 3 — `EXPLAIN ANALYZE` nas consultas de maior volume (Concluído por substituição, 2026-09-16)

**Status**: encerrado sem código pendente desta versão do item. O diagnóstico da Rodada 2 executou
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` direto no Neon com dado real (mais representativo que
qualquer massa sintética que este item pedia) e encontrou um achado concreto: autocomplete CNES
(`ILIKE '%texto%'` sobre 635 mil linhas) em pior caso leva ~227 ms por `Seq Scan`. As demais
consultas medidas têm plano adequado. O próximo passo (avaliar `pg_trgm`/GIN) não é mais parte
deste item — virou o Bloco 3 da seção "Rodada 2" abaixo, com objetivo/riscos próprios.

**Objetivo original** (referência histórica): constituição (Seção 8, "Sempre") exige `EXPLAIN
ANALYZE` antes de considerar query de alto volume pronta; hoje nenhuma consulta do SIGEO tinha essa
evidência registrada — motivo pelo qual este item existia.

## Item 4 — Automatizar comparação metadata × migrations × ER (Aplicado em 2026-09-17)

Achado durante a execução: a comparação já existia em `backend/tests/test_schema_migrations.py`
(`compare_metadata` + `ScriptDirectory`) — extraída para `backend/scripts/schema_drift.py` (módulo
puro, sem assert/print), reaproveitado pelo teste (inalterado em comportamento) e por
`backend/scripts/auditar_drift_schema.py` (CLI de relatório, `exit(0)` por padrão, `--strict` para
uso futuro em CI; bloco best-effort de comparação com `docs/database/modelo_er.mermaid`, sempre
informativo). CI de backend não existe hoje — fica registrado como próximo passo do ciclo devops.


**Objetivo**: constituição pede schema previsível; hoje a conferência de 21/21 tabelas e 23/23 FKs
no diagrama foi manual (registrada em 2026-09-16), sem repetição automática.

**Modelagem/Migração**: nenhuma mudança de schema — script novo
(`backend/scripts/auditar_drift_schema.py` ou extensão de `auditar_integridade_database.py`) que
compara `Base.metadata` com o head do Alembic e opcionalmente com `docs/database/modelo_er.mermaid`.

**Performance**: nenhuma.

**Riscos**: nenhum. Rodar em CI, não bloqueia deploy inicialmente (relatório, não gate) até
estabilizar.

## Decisões registradas sem migração nesta rodada

- **JSONB**: revisão mantém as 7 colunas como estão — todas são payload externo/auditável
  (`siconv_raw`, `transferegov_raw`, `metas_resumo`, `active_sources`, `details`,
  `equipamentos_tags`). Nenhuma virou candidata a normalização por falta de consumo por
  filtro/relação estruturado hoje. Reabrir só quando um consumidor concreto precisar filtrar/
  relacionar um desses campos.
- **Nomenclatura PT/EN de tabela**: mantida como está — qualquer troca segue expand-contract
  completo (não é este plano) e só se justifica por confusão real relatada, não estética.
- **`created_at`/`updated_at`/soft delete**: nenhuma tabela identificada com requisito de auditoria
  pendente sem essas colunas nesta leitura; não adicionar coluna sem consumidor.

## Ordem de execução recomendada (Rodada 1, histórico)

1. Item 1 (teste de violação) — maior valor, zero risco, fecha o gap mais citado pela constituição.
2. Item 2 (nomenclatura) — baixo risco, mas exige o grep de verificação antes de qualquer rename.
3. Item 4 (automação de drift) — evita a próxima rodada de diagnóstico repetir trabalho manual.
4. Item 3 — encerrado por substituição (ver nota no item); virou Bloco 3 da Rodada 2.

---

# Rodada 2 — validação direta no Neon (2026-09-16)

Cobre os achados de `diagnostico-constituicao-database-2026-09-16.md` (reescrito para Neon) e
`avaliacao-diagnostico-database-2026-09-16.md` (Rodada 2). Cada bloco segue o formato da
constituição (Objetivo / Modelagem / Migração / Performance / Riscos) e inclui, por pedido
explícito desta rodada, **Arquivos de contexto a atualizar** e **Arquivos/scripts/código a
excluir** — quando não houver nada a excluir, o bloco diz isso explicitamente em vez de omitir a
seção.

## Bloco 1 — SSL obrigatório e privilégio mínimo do role de runtime (P0) — Aplicado em 2026-09-17

**Objetivo**: `pg_stat_ssl=false` observado na conexão de auditoria contradiz a suposição de
criptografia em trânsito; o role de runtime tem `CREATEDB`/`CREATEROLE`/`CREATE` no schema, que a
API nunca usa em request normal. Motivo: constituição Seção 6 ("usuário de aplicação... permissão
mínima necessária, sem `SUPERUSER`/`DBA`") e Núcleo Duro (segredo/credencial e menor privilégio).

**Modelagem**: nenhuma tabela muda. Cria dois roles Postgres: `sigeo_runtime` (só `CONNECT`,
`USAGE` no schema, `SELECT`/`INSERT`/`UPDATE`/`DELETE` nas tabelas de domínio, `USAGE` nas
sequences) e `sigeo_migration` (dono do schema, roda só `alembic upgrade head` fora do boot da API —
ver Bloco 4). Nenhum dos dois recebe `CREATEDB`/`CREATEROLE`.

**Migração**: sem migration Alembic — é DDL de role/grant fora do versionamento de schema, aplicado
uma vez no Neon (`REVOKE`/`CREATE ROLE`/`GRANT`) e documentado em runbook, não em `alembic/versions`.
`DATABASE_URL` passa a exigir `sslmode=require` (ou `verify-full`, conforme suporte do plano Neon).

**Performance**: nenhuma.

**Riscos**: trocar a credencial de runtime é breaking change operacional — exige atualizar o secret
no Render e em qualquer workflow que hoje usa a credencial antiga, na mesma janela, e revalidar
`pg_stat_ssl=true` e ausência de erro de permissão em cada rota antes de considerar concluído.
Cruza com o ciclo de segurança já aberto (rotação de segredo) — rodar como uma única mudança
coordenada, não duas.

**Arquivos de contexto a atualizar**: `README.md`/`backend/README.md` (variável `DATABASE_URL` de
exemplo, se documentar `sslmode`); nenhuma menção a papel de banco existia antes, então não há
drift de documentação a corrigir, só conteúdo novo a acrescentar.

**Arquivos/scripts/código a excluir**: nenhum identificado. Não há script que dependa do privilégio
elevado do role atual (`CREATEDB`/`CREATEROLE` não são usados por nenhum script/rota desta base).

## Bloco 2 — migration de `refresh_token` (P0) — Aplicado (local + Neon) em 2026-09-16

Migration `5557cabd4a4c` (`CREATE TABLE refresh_token`, PK identity, FK `user_id` com
`ON DELETE CASCADE`/`ON UPDATE RESTRICT`, `UNIQUE(token_hash)`, índice em `user_id`). Modelo já
tinha `expires_at`/`revoked_at` suficientes — nenhum campo novo precisou ser acrescentado.
Validado contra `par_equipamentos_pytest_loaded` (clone local dedicado): `alembic upgrade head` /
`downgrade -1` / `upgrade head` simétrico, `psql \d refresh_token` confere PK/FK/UNIQUE/índice
batendo com o model, `pytest tests/test_schema_migrations.py -m db` reporta zero drift. `pytest -m db`
completo rodou 59 passed / 1 failed — a falha (`test_equipment_totals.py::test_sem_filtro_bate...`)
é o mesmo drift de fixture local já registrado no diagnóstico (Neon×local diferem em
`macro_coverage`), não relacionado a esta migration. `pytest -m "not db"` sem regressão (46 passed).
Aplicado ao Neon via `alembic upgrade head` manual (comando único e revisado, não pelo boot
automático — Bloco 4 segue pendente) e conferido com `psql \d refresh_token` batendo exatamente com
o model. Ainda não consumido por nenhuma rota (wiring no fluxo de auth é escopo do Plan Mode de
segurança). `docs/database/modelo_er.mermaid` e `docs/database/modelo_er.md` atualizados com a
entidade nova.

**Objetivo original** (referência): `RefreshToken` existe em `backend/app/db/models.py:161-181` mas não tem migration —

**Objetivo**: `RefreshToken` existe em `backend/app/db/models.py:161-181` mas não tem migration —
drift real confirmado (nenhum arquivo em `alembic/versions` referencia `refresh_token`). Qualquer
fluxo que tente persistir um refresh token falha com relação inexistente. Motivo: também é
pré-requisito de infraestrutura para o Bloco 2 do Plan Mode de segurança
(`planmode-seguranca-2026-09-16.md`, sessão com refresh rotativo) — esta migration deve rodar antes
daquele item de segurança poder ser implementado de ponta a ponta.

**Modelagem**: tabela `refresh_token` já modelada (FK para `usuarios`, índice em `user_id`, unique
em `token_hash`) — conferir no Plan Mode se `expires_at`/`revoked_at` já cobrem a necessidade de
expiração e revogação que o Bloco 2 de segurança exige, ou se o modelo precisa de campo adicional
antes da migration ser gerada (decidir aqui, não depois de aplicar).

**Migração**: uma migration aditiva (`CREATE TABLE refresh_token`, índice, unique) — sem impacto em
dado existente, sem `NOT NULL` problemático (tabela nova, vazia). Testar `upgrade`/`downgrade`
local antes de aplicar ao Neon.

**Performance**: índice em `user_id` já modelado; volume esperado é baixo (uma linha por sessão
ativa), sem necessidade de partição.

**Riscos**: baixo — migration puramente aditiva. Risco real é de sequência entre times: se o
backend/segurança começar a gravar refresh token antes da migration rodar no Neon, quebra em
produção — aplicar a migration antes de qualquer deploy que use a tabela.

**Arquivos de contexto a atualizar**: `docs/database/modelo_er.mermaid` (adicionar entidade
`refresh_token` e sua FK para `usuarios` — confirmado ausente); `backend/scripts/schema_drift.py`/
`auditar_drift_schema.py` devem passar a reportar zero divergência depois da migration (não exige
mudança de código, só nova execução de verificação).

**Arquivos/scripts/código a excluir**: nenhum. `RefreshToken` já é código novo, não substitui nada.

## Bloco 3 — avaliar índice trigram para busca de CNES (P1, encerra o antigo Item 3) — Aplicado em 2026-09-17

**Objetivo**: pior caso de 227 ms em busca sem correspondência (`Seq Scan` sobre 635 mil linhas)
medido no Neon real. Constituição Seção 8: só criar índice depois de `EXPLAIN` real — já feito;
falta decidir se o ganho compensa o custo de escrita antes de migrar.

**Modelagem**: nenhuma mudança de tabela — extensão `pg_trgm` (se disponível no Neon) e índice GIN
em `cnes_estabelecimento.nome_estabelecimento`.

**Migração**: testar primeiro em banco descartável (não Neon) com cópia representativa: medir
tempo de busca antes/depois, tamanho do índice, e custo de escrita em `INSERT`/`UPDATE` dessa
tabela (que já recebe sincronização periódica via `sincronizar_cnes_referencia*.py`). Migration real
só é escrita depois dessa medição, como item novo de Plan Mode caso o ganho justifique.

**Performance**: é o próprio objetivo do bloco — só evolui com medição, não com suposição.

**Riscos**: `CREATE INDEX` em tabela de 635 mil linhas pode ser lento/bloqueante sem
`CONCURRENTLY` — usar `CREATE INDEX CONCURRENTLY` se for aplicado.

**Arquivos de contexto a atualizar**: nenhum agora — só quando (se) a migration real for criada.

**Arquivos/scripts/código a excluir**: nenhum.

## Bloco 4 — desacoplar migration do boot e dos jobs (P1) — Aplicado em 2026-09-17

**Objetivo**: `render.yaml:22`, `.github/workflows/pipelines.yml:59` e
`.github/workflows/radar_convenios.yml:53` rodam `alembic upgrade head` acoplado ao boot/job, usando
credencial com privilégio de runtime hoje elevado (Bloco 1). Uma ref não validada em qualquer um
desses três pontos pode aplicar DDL direto no Neon sem revisão isolada.

**Modelagem**: nenhuma. É mudança de pipeline/deploy, não de schema.

**Migração**: nenhuma migration nova — é passar a rodar `alembic upgrade head` como passo manual
aprovado ou job dedicado com o role `sigeo_migration` do Bloco 1, separado do `startCommand` da API
e dos workflows de dados.

**Performance**: nenhuma.

**Riscos**: se não for coordenado, um deploy pode subir código novo esperando uma coluna que a
migration (agora manual) ainda não aplicou — decidir e documentar a ordem (migration sempre antes
do deploy de código que a usa), não deixar implícito.

**Arquivos de contexto a atualizar**: `render.yaml` (`startCommand`),
`.github/workflows/pipelines.yml`, `.github/workflows/radar_convenios.yml` (os três pontos exatos
confirmados nesta avaliação — não só "os workflows" genericamente); `README.md`/`AGENTS.md` do
projeto, se documentarem hoje o fluxo de deploy, precisam citar o novo passo manual/dedicado de
migration.

**Arquivos/scripts/código a excluir**: nenhum arquivo — a linha `alembic upgrade head` sai do
`startCommand`/workflow, não é um arquivo próprio para deletar.

## Bloco 5 — CI de drift e evidência de backup (P1, parcialmente fora do escopo database) — Segue pendente (fora de escopo deste Plan Mode)

**Objetivo**: nada garante hoje, de forma automática, que modelo/migration/Mermaid não divirjam de
novo (o Item 4 da Rodada 1 criou a ferramenta `auditar_drift_schema.py`, mas nenhum pipeline chama
`--strict`); backup/retenção/restore do Neon seguem não comprovados por este diagnóstico.

**Modelagem/Migração**: nenhuma.

**Ação**: registrar aqui a parte que é database (rodar `auditar_drift_schema --strict` e
`pytest -m db` em CI) e explicitamente devolver ao ciclo devops & observabilidade
(`planmode-devops-*.md`, próximo na ordem da Seção 2.2) a parte de runbook de backup/PITR/restore —
não duplicar esse item em dois Plan Modes.

**Riscos**: nenhum — é adição de gate, não mudança de schema.

**Arquivos de contexto a atualizar**: pipeline de CI (arquivo ainda não criado para o backend, ver
diagnóstico backend — este Plan Mode não cria CI novo, só registra o requisito para quando existir).

**Arquivos/scripts/código a excluir**: nenhum.

## Decisão de contexto — estratégia de ingestão e clonagem (registrar em `CLAUDE.md`)

O diagnóstico da Rodada 2 registrou uma decisão do usuário (dado "congelado" vs. "vivo",
`pg_dump`/`pg_restore` como forma de migração de servidor) dentro do próprio arquivo de
diagnóstico. A avaliação desta rodada confirma que isso ainda não existe em nenhum arquivo de
contexto durável do projeto. Esta é uma atualização de documentação pura (decisão já tomada, não
implementação pendente) — aplicada já nesta entrega do Plan Mode, sem esperar os Blocos 1-5:
ver `CLAUDE.md`, seção "Estratégia de dados do Neon: ingestão e clonagem" — **aplicada** (conferido
nesta reaplicação: a seção já existe em `CLAUDE.md` com o conteúdo completo de congelado/vivo/
`pg_dump`-`pg_restore`, nada pendente aqui).

> A ordem de execução desta Rodada 2 foi substituída pela ordem da Rodada 3 (Item 0 novo de higiene
> de versionamento antes de tudo) — ver seção "Rodada 3" abaixo. Não seguir a numeração 1-5 isolada
> desta seção.

---

# Rodada 3 — reaplicação/verificação (2026-09-16, mesma sessão de origem)

Reexecução do Plan Mode pedida pelo usuário, conferindo o plano acima contra o estado real do
repositório (git log, cadeia de migrations, `config.py`, `render.yaml`, workflows) antes de liberar
implementação — sem tocar em código nesta rodada.

**Rodada 2 confirmada sem drift**: os 5 blocos seguem 100% pendentes, validado por leitura direta:

- Bloco 1 (SSL/privilégio): `backend/app/config.py` não tem `sslmode`/separação de role; único
  `sslmode=require` do repo está em `backend/.env` (a própria URL de conexão, não uma exigência
  aplicada em código).
- Bloco 2 (`refresh_token`): nenhuma migration na cadeia referencia `refresh_token` — a tabela
  continua só em `models.py:161-181`.
- Bloco 3 (trigram): nenhuma menção a `pg_trgm` fora dos próprios documentos de diagnóstico/plano.
- Bloco 4 (migration acoplada): `render.yaml` (`startCommand`), `.github/workflows/pipelines.yml:59`
  e `.github/workflows/radar_convenios.yml:53` continuam rodando `alembic upgrade head` acoplado.
- Bloco 5 (CI/drift): `.github/workflows/` só tem `pipelines.yml` e `radar_convenios.yml` — nenhum
  chama `schema_drift`/`auditar_drift_schema`.

**Achado novo desta rodada (P0 operacional, fora do escopo dos Blocos 1-5 mas bloqueia a ordem de
execução deles)**: a Rodada 1 (Itens 1, 2, 4) está de fato aplicada no schema local — a cadeia do
Alembic tem head em `9d2e13b1f93a` e inclui as 4 migrations que fecham FK física de CNES, CHECKs,
`ON UPDATE` explícito e colunas de geolocalização (`e3a9c5b7d2f1`, `a7c4e1f9b203`, `b8d2c6f4a901`,
`c9f1a4d7e602`) — mas essas 4 migrations existem só no disco, nunca foram commitadas (`git status`
lista como `??`). Enquanto isso, `backend/app/repositories/`, `backend/app/services/` e mais de uma
dezena de scripts/testes novos também estão untracked. Risco concreto: qualquer ambiente que só
clone o git (CI futuro, outro desenvolvedor, o próprio Bloco 4 depois de desacoplar migration do
boot) não tem essas 4 migrations e quebra ao tentar `alembic upgrade head`, ou diverge do head real
já aplicado no Neon local. Isso precisa ser commitado **antes** de iniciar qualquer bloco da Rodada
2 — não é um bloco novo de schema, é higiene de versionamento que os Blocos 1 e 4 (que mexem
exatamente em migration/deploy) dependem para fazer sentido.

**Blocos 1-5 da Rodada 2 permanecem o plano vigente, sem alteração de conteúdo** — só a ordem de
execução muda, para tratar o achado acima primeiro:

## Ordem de execução (Rodada 3, substitui a ordem da Rodada 2)

0. **Commitar as 4 migrations pendentes** (`e3a9c5b7d2f1`, `a7c4e1f9b203`, `b8d2c6f4a901`,
   `c9f1a4d7e602`) e o restante do trabalho untracked relevante a schema (`backend/app/repositories/`,
   scripts de auditoria/sincronização, testes de integridade) — pré-requisito de higiene, zero
   mudança de conteúdo, só fecha o gap entre disco e git antes de qualquer coisa tocar em
   deploy/migration.
1. Bloco 2 (`refresh_token`) — aditivo, zero risco, destrava o Plan Mode de segurança já aprovado.
2. Bloco 1 (SSL + privilégio mínimo) — P0 de segurança operacional; coordenar com rotação de
   credencial do ciclo de segurança.
3. Bloco 4 (desacoplar migration do boot) — depende do role `sigeo_migration` do Bloco 1 existir.
4. Bloco 3 (trigram CNES) — não bloqueia nada; medir quando houver ambiente de teste dedicado.
5. Bloco 5 (CI de drift) — parte database entra quando existir CI de backend; parte backup segue
   para o ciclo devops.

Implementação segue item a item, só após aprovação explícita — nenhum código foi alterado nesta
rodada de reaplicação.

---

# Rodada 4 — implementação (2026-09-17)

Usuário autorizou explicitamente rodar o plano inteiro contra o Neon ("o banco Neon é de
desenvolvimento pode rodar todo o plano no Neon"). Execução, na ordem da Rodada 3:

**Item 0** (commit de higiene): commitado em `1c8989f` — as 4 migrations do Bloco 7 + testes/script
de integridade que só existiam em disco.

**Bloco 2** (`refresh_token`): commitado em `46597f1` — migration `5557cabd4a4c` testada local
(`par_equipamentos_pytest_loaded`) e aplicada ao Neon.

**Bloco 1** (SSL + privilégio mínimo):

- **SSL — achado corrigido em relação ao diagnóstico original**: `pg_stat_ssl=false` observado pela
  auditoria **não é falta de criptografia**. Confirmado com `psql \conninfo` na mesma sessão: `SSL
  Connection: true`, `TLSv1.3`, `TLS_AES_256_GCM_SHA384`; e o servidor **recusa** ativamente
  `sslmode=disable` com erro explícito (`connection is insecure`). O `ssl=false` em `pg_stat_ssl` é
  um artefato da arquitetura de proxy serverless do Neon (o proxy termina o TLS do cliente e
  encaminha pro compute Postgres por um caminho interno — a estatística reflete esse último salto,
  não o canal real cliente↔Neon). Não havia gap de criptografia em trânsito; não foi necessária
  nenhuma mudança de código pra isso.
- **Privilégio mínimo — aplicado de fato**: criados dois roles novos no Neon (`CREATE ROLE ...
  NOCREATEDB NOCREATEROLE NOSUPERUSER`), confirmado via `pg_roles` que nenhum tem os atributos
  elevados que `neondb_owner` tinha. Posse de todas as 23 tabelas e 21 sequences do schema `public`
  transferida (`ALTER TABLE/SEQUENCE ... OWNER TO`) de `neondb_owner` para `sigeo_migration` (a
  tentativa de herdar via `GRANT neondb_owner TO sigeo_migration` falhou — Neon não permite
  delegação de `ADMIN OPTION` sobre o role gerenciado da conta; transferência de posse direta é o
  caminho padrão do Postgres e funcionou). `sigeo_runtime` recebeu só `CONNECT`/`USAGE`/
  `SELECT,INSERT,UPDATE,DELETE`/sequences via `GRANT`, com `ALTER DEFAULT PRIVILEGES FOR ROLE
  sigeo_migration` garantindo que tabelas futuras (criadas por migration) já nascem com esse grant.
  Testado e confirmado: `sigeo_runtime` lê/escreve dado normalmente e tem `CREATE TABLE` **negado**;
  `sigeo_migration` roda `ALTER TABLE` normalmente. `neondb_owner` continua existindo (Neon não
  permite removê-lo nem revogar seus atributos — é o role gerenciado da conta) mas **não é mais
  usado por nenhuma credencial de aplicação**.
- **Código**: `Settings.database_url_migration` novo (`backend/app/config.py`) — Alembic usa essa
  URL quando definida (role `sigeo_migration`), cai pro `database_url` de runtime quando vazia
  (compatibilidade com ambiente local/teste, um único Postgres sem essa separação). `backend/.env`
  (não versionado) atualizado com `DATABASE_URL` = `sigeo_runtime` e `DATABASE_URL_MIGRATION` =
  `sigeo_migration`; `.env.example` documenta a variável nova. Teste novo em
  `tests/test_config.py::test_url_do_alembic_usa_database_url_migration_quando_definida`.
- Validado: `pytest -m "not db"` completo (47 passed) e smoke-test manual do app (`SessionLocal`
  contando `Convenio` com `sigeo_runtime`) sem erro de permissão.

**Bloco 4** (desacoplar migration do boot/jobs): `alembic upgrade head` removido do `startCommand`
de `render.yaml` e dos steps "Aplica migrations pendentes" de `pipelines.yml`/`radar_convenios.yml`
(esses dois jobs só faziam DML mesmo, nunca precisaram de DDL). Workflow novo
`.github/workflows/migrar_banco.yml` (só `workflow_dispatch`, credencial `DATABASE_URL_MIGRATION`
dedicada) é o fluxo protegido — roda manualmente, sempre antes de qualquer deploy/job que dependa de
schema novo. `render.yaml`/os dois workflows ganharam comentário explicando a mudança de
comportamento pra quem for debugar um deploy futuro.

**Bloco 3** (trigram CNES): medido em `par_equipamentos_pytest_loaded` (mesmas 635 mil linhas do
Neon) — pior caso (sem correspondência) caiu de ~187-227ms (`Seq Scan`) pra ~0,3ms (`Bitmap Index
Scan`); busca comum (~1300 resultados) em ~10ms; índice de 39MB (~19% do tamanho da tabela). Ganho
de 2-3 ordens de magnitude justifica plenamente o custo de escrita numa tabela de referência com
sincronização periódica (não OLTP de escrita contínua). Migration `efd3e49db7f8` (`CREATE EXTENSION
pg_trgm` + `CREATE INDEX CONCURRENTLY ... USING gin (nome_estabelecimento gin_trgm_ops)`, fora de
transação via `autocommit_block`) testada local (up/down simétrico) e aplicada ao Neon — achado
extra: `sigeo_migration` não tem privilégio pra `CREATE EXTENSION` mesmo sendo dono das tabelas
(Postgres trata extensão como recurso de nível de banco, não de schema); a extensão foi criada uma
única vez como `neondb_owner` (ação de infraestrutura, não de schema de aplicação) e a migration
(idempotente, `IF NOT EXISTS`) roda normalmente depois disso com `sigeo_migration`. Índice declarado
em `app/db/models.py` (`CnesEstabelecimento.__table_args__`) pra `test_head_aplicado_bate_com_models`
não acusar drift. Confirmado no Neon real: mesma query caiu de 227ms pra 0,32ms.

**Bloco 5** (CI de drift): não implementado nesta rodada — o próprio texto do bloco já delimitava
isso ("este Plan Mode não cria CI novo, só registra o requisito para quando existir"); criar o
primeiro workflow de CI de backend é decisão do ciclo devops (`diagnostico-constituicao-devops-
2026-09-16.md`), não algo pra originar aqui só porque o Neon está liberado pra mudança. Quando esse
CI existir, adicionar `pytest -m db` e `auditar_drift_schema.py --strict` como já estava planejado.

Todos os testes (`pytest -m "not db"`: 47 passed; `pytest -m db` contra o clone local: 59 passed, 1
failed — a mesma falha de fixture desatualizada já registrada, sem relação com qualquer mudança
desta rodada) seguem sem regressão depois de todos os blocos aplicados.
