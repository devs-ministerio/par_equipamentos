# Reavaliação da Constituição Backend — 2026-09-17

## Escopo e método

Esta reavaliação substitui o diagnóstico inicial de 2026-09-16 e considera os Plan Modes de database e segurança já implementados. Foram confrontados o código atual e `padroes/backend/constituicao_backend.md`, com inspeção das rotas, Services, Repositories, contratos, autenticação, migrações, workflows e testes. O Neon também foi consultado diretamente, sem leitura de dados de negócio.

## Resultado executivo

### Original (2026-09-17)

**Conformidade backend: 7,0/10** (antes: 6,5/10).

O avanço é real: autenticação por cookie HttpOnly, refresh token rotativo, rate limit, headers, CORS validado, autorização de monitoramento no Service, papéis de banco separados e migrações manuais corrigiram os maiores riscos do diagnóstico original. O backend, porém, ainda não cumpre sua própria arquitetura: a maior parte das queries continua nos routers; Services acessam SQLAlchemy e levantam `HTTPException`; não existe hierarquia de erro de domínio, envelope unificado, paginação universal, observabilidade estruturada ou gates de lint/typecheck/coverage.

O próximo bloco deve ser a fundação backend, começando por uma feature pequena e preservando contratos. Migrar todo o backend de uma vez elevaria o risco de regressão sem produzir valor proporcional.

### Atualização 2026-09-17 (pós-execução do Plan Mode backend)

**Conformidade backend: 7,3/10** (antes: 7,0/10).

`planmode-backend-2026-09-17.md`, Bloco 1 (fundação backend), foi executado por inteiro — ver
"Backend" em "O que os Plan Modes fecharam" e "Execução" mais abaixo para o detalhe arquivo a
arquivo. O avanço é real mas deliberadamente pequeno: a hierarquia `DomainError` existe e está
traduzida centralmente, o contrato Repository/Service está documentado e provado numa feature
piloto (`notificacoes`, além de `propostas_candidatas` que já existia), `ruff`/`mypy` rodam com
baseline versionada, e os 3 schemas mortos comprovados saíram do código. A nota sobe pouco porque o
volume de código migrado é pequeno de propósito (evitar regressão) — `monitoramento.py` (767
linhas) e a maior parte dos routers de domínio continuam `Router -> SQLAlchemy` direto, sem
envelope de resposta, paginação universal ou observabilidade estruturada. Nenhum desses itens
regrediu; todos os achados P0/P1/P2 abaixo que não foram citados como resolvidos continuam de pé.

### Atualização 2026-09-17 (correção pós-consolidação)

`docs/arquitetura/planmode-consolidacao-2026-09-17.md` reconferiu os achados P0 abaixo contra o
código atual (não só releu este documento) e encontrou 3 dos 4 P0 já fechados por
`planmode-database-2026-09-17.md`, que rodou depois deste diagnóstico ter sido escrito mas antes da
consolidação — a redação abaixo não tinha sido atualizada para refletir isso. Confirmado no código:

- ~~**P0.2 — Rotação de refresh não é atômica sob concorrência.**~~ **RESOLVIDO** em
  `planmode-database-2026-09-17.md` — `rotate_refresh_token`/`revoke_refresh_token`
  (`backend/app/auth.py`, linhas 90-169) usam `UPDATE ... WHERE revoked_at IS NULL RETURNING ...`
  atômico, não mais `SELECT` + atribuição + `commit()`.
- ~~**P0.3 — Seleção silenciosa da URL de migration.**~~ **RESOLVIDO** em
  `planmode-database-2026-09-17.md` — `Settings.database_url_alembic` (`backend/app/config.py`)
  agora checa `os.environ.get("DATABASE_URL")` (variável exportada de verdade no processo) antes de
  `database_url_migration`; `backend/alembic/env.py` ecoa o host resolvido em stderr antes de
  qualquer comando.
- ~~**P0.4 — Rollback final inválido em banco populado.**~~ **RESOLVIDO** — a migration
  `f8fe7ce9347c` tem `server_default=sa.text("'nao-informado'")` no `downgrade()`, não falha mais em
  banco populado.

O único P0 genuíno que restava entre os três diagnósticos (database, segurança, backend) era o P0.1
(CSRF) — **RESOLVIDO em 2026-09-17** pelo Bloco 1 de `planmode-consolidacao-2026-09-17.md`
(double-submit cookie, `backend/app/main.py::csrf_middleware`, testado em
`backend/tests/test_csrf.py`). Bloco 2 do mesmo Plan Mode também removeu o bearer fallback e o
`access_token` no corpo de login/refresh (P1 "compatibilidade dupla" listado abaixo). Blocos 3
(fatia de leitura de `monitoramento.py` migrada pro contrato Repository/Service) e 4 (teto de
segurança nas listas sem paginação) também fecharam parcialmente 2 P1 de arquitetura/contratos.
**Nota consolidada sobe para 7,8/10** (segurança de fronteira 8,0→8,5, arquitetura em camadas
4,0→4,8, resiliência e volume 6,0→6,5 nos eixos abaixo).

## Nota por eixo

| Eixo | Nota (2026-09-17 diagnóstico) | Nota (pós-execução) | Evidência principal |
|---|---:|---:|---|
| Segurança de fronteira | 8,0 | 8,5 | Cookie HttpOnly, refresh rotativo, rate limit, CORS, headers e CSRF (double-submit cookie, 2026-09-17) |
| Banco e transação | 8,0 | 8,0 | Neon em `f8fe7ce9347c`, runtime sem DDL, índice trigram e TLS no driver — inalterado |
| Arquitetura em camadas | 4,0 | 4,8 | 3 Repositories agora (`propostas_candidatas`, `notificacoes`, `monitoramento`); contrato documentado e provado numa fatia de leitura do maior router (`monitoramento.py`); escrita e resto dos routers de domínio ainda direto |
| Contratos e validação | 6,5 | 6,5 | Pydantic e `response_model`; formatos ainda não envelopados e payload externo genérico — inalterado |
| Resiliência e volume | 6,0 | 6,5 | Timeouts/retries; teto de segurança agora em toda lista sem paginação real (Bloco 4, 2026-09-17) — falta paginação completa e resolver a race do refresh (já fechada, ver database) |
| Testes e gates | 6,0 | 7,0 | `ruff`/`mypy` configurados com baseline versionada (não bloqueiam CI ainda); testes novos de erro de domínio e do piloto |
| Observabilidade | 3,0 | 3,0 | Handler global existe; faltam JSON, trace, duração e métricas — inalterado |
| Código morto/organização | 6,5 | 7,5 | `ErrorResponse`/`UserCreate`/`TokenPayload` removidos (comprovados sem consumidor); responsabilidades ainda concentradas em `monitoramento.py` e afins |

## O que os Plan Modes fecharam

### Database

- O Neon está na revisão Alembic `f8fe7ce9347c`.
- `refresh_token` existe e o papel runtime possui apenas DML necessário.
- O papel runtime não é superuser, não cria banco, role ou objeto no schema.
- O índice GIN trigram está presente.
- `user.cpf_hash` foi removido.
- A conexão cliente-Neon usa TLS segundo o objeto libpq (`ssl_in_use=True`). `pg_stat_ssl` retorna `false` atrás do pooler e não mede esse trecho cliente-pooler; a verificação correta foi feita no driver.
- O Render não executa migration no start e existe workflow manual dedicado.

### Segurança

- Todo o produto foi colocado atrás de autenticação, com exceções públicas explícitas para saúde, autenticação e catálogo de marcos.
- O frontend usa cookie HttpOnly e deixou de persistir tokens no localStorage.
- Access token curto e refresh opaco persistido/rotativo foram implementados.
- Login e refresh têm rate limit.
- CORS rejeita wildcard e origem insegura; métodos e headers são restritos.
- HSTS, `nosniff`, frame deny, referrer policy e CSP Report-Only estão ativos.
- A permissão de edição de monitoramento também é verificada no Service.
- Erros de validação deixam de devolver input e contexto sensíveis.

### Backend (Plan Mode 2026-09-17)

- `DomainError`/`NotFoundError`/`ConflictError`/`ValidationError`/`AuthorizationError`
  (`app/domain_errors.py`) existem e são traduzidos centralmente em `app/errors.py`, no mesmo
  formato `{"error", "detail"}` de antes.
- `app/authz.py` e `app/services/propostas_candidatas.py` não importam mais `fastapi.HTTPException`.
- Contrato Repository/Service está escrito em `padroes/backend/constituicao_backend.md` Seção 3.
- `notificacoes` é a segunda feature em Router → Service → Repository (`app/repositories/
  notificacoes.py`, `app/services/notificacoes.py`) — router ficou fino, contrato HTTP preservado.
- `ErrorResponse`, `UserCreate`, `TokenPayload` foram removidos de `app/schemas.py`.
- `ruff`/`mypy` rodam com baseline versionada (`backend/.ruff-baseline.json`,
  `backend/.mypy-baseline.json`) — achado legado documentado, código novo nasce limpo.

## Achados pendentes

### P0 — segurança e operação

1. ~~**Autenticação por cookie sem defesa CSRF explícita.**~~ **RESOLVIDO (2026-09-17)** — ver
   "Atualização 2026-09-17 (correção pós-consolidação)" no topo do documento.
2. **Rotação de refresh não é atômica sob concorrência.** A consulta do token não usa `SELECT ... FOR UPDATE` nem atualização condicional. Duas requisições simultâneas podem validar o mesmo token antes de ambas o revogarem e criarem dois sucessores.
3. **Seleção silenciosa da URL de migration.** `Settings.database_url_alembic` prefere `DATABASE_URL_MIGRATION` carregada do `.env`, mesmo quando `DATABASE_URL` é sobrescrita no comando. Isso fez um comando planejado para o PostgreSQL local atingir o Neon. A interface precisa exigir seleção explícita do alvo ou impedir fallback silencioso em ambiente local/CI.
4. **Rollback final inválido em banco populado.** O downgrade de `f8fe7ce9347c` recria `cpf_hash` como `NOT NULL` sem default/backfill. Ele falhará se `user` tiver linhas, contrariando a reversibilidade exigida.

### P1 — arquitetura

1. A aplicação permanece majoritariamente `Router -> SQLAlchemy`. Há queries diretas em praticamente todos os routers de domínio. **Ainda vale, parcialmente reduzido** — `notificacoes`/`propostas_candidatas` (Plan Mode backend 2026-09-17) + fatia de leitura de `monitoramento.py` (`listar_instrumentos`/`obter_timeline`, Bloco 3 de `planmode-consolidacao-2026-09-17.md`) migraram; escrita de monitoramento e o resto dos routers de domínio continuam diretos.
2. ~~Existe só um Repository de domínio (`propostas_candidatas`).~~ **Parcialmente resolvido, avançou mais**: agora são 3 (`propostas_candidatas`, `notificacoes`, `monitoramento` — este último novo em 2026-09-17, primeira extração de query real do maior router do backend) — ainda pouco frente ao total de routers de domínio.
3. Os Services de monitoramento recebem `Session`, executam query e importam `HTTPException`; logo não são casos de uso isolados da web e do banco. **Ainda vale para a escrita de `monitoramento_instrumentos.py` (`criar_instrumento_monitorado`) e a maior parte de `monitoramento_eventos.py`** — a fatia de leitura (`listar_instrumentos_monitorados`/`obter_timeline_instrumento`, mesmo arquivo) já levanta `NotFoundError`/não recebe mais lógica de query direto (delegada ao Repository), fechada em 2026-09-17 (Bloco 3 da consolidação). **Avançou mais em 2026-09-19** (Plan Mode monitoramento-evolucao): as 4 funções novas de editar/excluir (`editar_evento_monitorado`/`excluir_evento_monitorado`/`editar_acao_monitorada`/`excluir_acao_monitorada`) já nascem levantando `NotFoundError`/`ValidationError`, não `HTTPException` — as funções antigas do mesmo arquivo (`registrar_evento_monitorado`, `registrar_acao_monitorada`, criação de instrumento) continuam com `HTTPException` direto, migração não é retroativa.
4. Commits continuam divididos entre routers e Services. A fronteira transacional não está padronizada. **Ainda vale** — contrato documentado (Bloco B do Plan Mode backend) declara o padrão-alvo, mas a escrita de `monitoramento.py` (commit no Router) não foi migrada; a leitura (sem commit, Bloco 3 acima) já segue o contrato.
5. `monitoramento.py` ainda concentra a maior parte de suas ~760 linhas (a fatia de leitura ficou mais fina, ver item 1); oferta de equipamentos, convênios e coberturas também mantêm consulta e regra no controller.
6. Schemas vivem tanto em `app/schemas.py` quanto dentro de routers, sem organização por feature.

### P1 — contratos, listas e integrações

1. Sucessos ainda retornam objetos/listas crus e erros usam `{error, detail}`; falta o envelope constitucional. A mudança é breaking e deve ser coordenada com o frontend ou versionada.
2. ~~Listas de macro, município, região de saúde, instrumentos, ações, marcos e facilities ainda não possuem paginação/teto coerente.~~ **RESOLVIDO (2026-09-17, Bloco 4 de `planmode-consolidacao-2026-09-17.md`)** — teto de segurança (`limit` com `le` server-side) em `macro-coverage`, `municipality-coverage`/`health-region-coverage`, `monitoramento/marcos`/`instrumentos`/`acoes`, e teto invisível em `/equipment-offer/facilities`; `equipment-offer`/`establishments` já tinham paginação real (`limit`/`offset`/`total`) antes deste bloco. Não é paginação de UI completa (sem `offset`/cursor de navegação nas listas de teto pequeno) — ver `padroes/backend/constituicao_backend.md` Seção 5, exceção documentada para volume pequeno e estável.
3. Integrações externas mantêm `dict[str, Any]` e não validam todos os payloads antes de entrar no domínio.
4. ~~O login ainda devolve `access_token` no corpo e mantém bearer fallback~~ **RESOLVIDO
   (2026-09-17, Bloco 2 de `planmode-consolidacao-2026-09-17.md`)** — confirmado com o usuário que
   não há consumidor de API além do frontend Vercel; `HTTPBearer`/fallback removidos de
   `require_current_user`, login/refresh só devolvem `{"status": "ok"}` (cookies carregam a sessão).
5. Logout revoga o refresh, mas o access token emitido continua válido por até 20 minutos; falta vínculo de sessão/JTI caso revogação imediata seja requisito.

### P2 — qualidade e observabilidade

1. ~~Não há `ruff`, `mypy`, cobertura mínima ou CI de aplicação configurados.~~ **Parcialmente resolvido** (Plan Mode backend 2026-09-17, Bloco E): `ruff`/`mypy` configurados com baseline versionada. Segue faltando: cobertura mínima e CI de aplicação (integração em pipeline é decisão de devops, não resolvida aqui).
2. Faltam logs JSON com `trace_id`, usuário, endpoint e `duration_ms`.
3. Não há métrica de duração de query/chamada externa nem alerta operacional.
4. `/docs` e `/openapi.json` permanecem públicos; isso deve ser uma decisão explícita por ambiente.
5. O rate limit em memória é por processo e não coordena múltiplas instâncias.
6. Permanecem warnings de depreciação Starlette/httpx e FastAPI 422.

### Código morto comprovável

- ~~`UserCreate`, `TokenPayload` e `ErrorResponse` não têm consumidores no código atual e são candidatos seguros à remoção após confirmação por teste.~~ **Resolvido** (Plan Mode backend 2026-09-17, Bloco D): as 3 classes foram removidas de `app/schemas.py`, reconfirmado por grep antes da remoção, suite completa sem quebra.
- `require_monitoramento_editor` continua usado e não é código morto.
- Scripts operacionais não foram classificados como mortos apenas por não serem importados; são entrypoints manuais e exigem prova de substituição antes de exclusão. **Ainda vale** — nenhum script foi removido neste Plan Mode.

## Incidente observado durante esta reavaliação

Ao preparar o banco local para os testes, foi executado `alembic upgrade head` com `DATABASE_URL` local. A configuração preferiu silenciosamente a `DATABASE_URL_MIGRATION` do `.env`, então a migration já versionada `f8fe7ce9347c` foi aplicada ao Neon. A alteração removeu `user.cpf_hash`, como previsto no Plan Mode de database, e o banco remoto está íntegro em `head`, mas o alvo remoto não era a intenção desta execução diagnóstica. Este fato é a evidência concreta do achado P0.3 e deve ser tratado antes de novos comandos de migration.

## Próximo bloco recomendado

### Bloco 1 — fundação backend sem quebrar o frontend

- Criar `DomainError` e subclasses, com tradutor HTTP central.
- Definir contrato de Repository e fronteira transacional no Service.
- Migrar **notificações** como feature piloto: schemas, Repository, Service, router fino e testes unitários/contrato.
- Configurar `ruff` e `mypy` com baseline explícito.
- Remover os três schemas mortos comprovados.
- Preservar o payload HTTP atual neste bloco; o envelope fica para migração coordenada posterior.

### Blocos seguintes

1. Monitoramento: separar instrumentos, eventos, ações e resumo.
2. Coberturas/ofertas: centralizar execução mais recente por família e queries.
3. Integrações: schemas externos e erros tipados.
4. Paginação e envelope: mudança coordenada com frontend.
5. Observabilidade: correlação, logs JSON, duração e métricas.

## Critério de encerramento da constituição backend

- Router não executa query nem regra de negócio.
- Service não importa FastAPI nem monta SQL.
- Repository é a única camada de acesso a banco/API externa.
- Erros de domínio são traduzidos centralmente.
- Toda lista possui paginação, teto ou exceção medida/documentada.
- Toda rota possui contrato e teste HTTP; Services têm testes unitários.
- Logs estruturados, lint, typecheck, testes e cobertura bloqueiam merge.
- Código substituído é removido no mesmo bloco.

## Evidências executadas

```text
Neon: alembic f8fe7ce9347c (head)
Neon: runtime sem superuser/createdb/createrole/CREATE no schema
Neon: refresh_token com DML; cpf_hash ausente; índice trigram presente
Neon: TLS confirmado pelo libpq (ssl_in_use=True)
pytest -m 'not db': 47 passed, 70 deselected
pytest -m db: 69 passed, 1 failed, 47 deselected
falha DB: fixture local de totais 4.381 vs. soma das macros 4.471
total: 116 de 117 testes executados passaram
ruff: não instalado
mypy: não instalado
Repositories de domínio: 1
Services de domínio: 3
```

Atualizado pós-execução do Plan Mode backend 2026-09-17 (`pytest -m db` não rerodado nesta sessão —
sem `TEST_DATABASE_URL` configurada no ambiente):

```text
pytest -m 'not db': 53 passed, 74 deselected
ruff check .: 222 achados, todos na baseline (.ruff-baseline.json) — 0 novo
mypy .: 80 achados, todos na baseline (.mypy-baseline.json) — 0 novo
Repositories de domínio: 2 (propostas_candidatas, notificacoes)
Services de domínio: 4 (propostas_candidatas, notificacoes, monitoramento_instrumentos, monitoramento_eventos)
```

## Execução (2026-09-17, Plan Mode backend)

`planmode-backend-2026-09-17.md`, Bloco 1 do "próximo bloco recomendado" acima, foi implementado
por inteiro (Blocos A-E do plano) — detalhe arquivo a arquivo em "Backend (Plan Mode 2026-09-17)",
dentro de "O que os Plan Modes fecharam".

**Ressalva de validação**: `pytest -m 'not db'` (53 passed, era 47 — 6 testes novos:
`test_errors.py` completo + `test_service_notificacoes.py`, gated do mesmo jeito que os demais
módulos que encostam em banco real) foi a única suíte rodada nesta sessão, sem
`TEST_DATABASE_URL` configurada no ambiente. `pytest -m db` (que cobre `test_notificacoes.py`,
`test_propostas_candidatas.py`, `test_monitoramento.py`, `test_service_notificacoes.py` — os 4
módulos com escrita real testada contra banco) não foi rerodado; recomenda-se rodar antes do
próximo deploy que inclua este bloco.

## Atualização 2026-09-20 — classificadores e ingestão manual

A ingestão de equipamentos está inconsistente: `importar_convenios_banco.py`,
`job_descoberta_transferegov.py`, `lib_monitoramento_convenio.py`,
`importar_programas_monitoramento.py` e `importar_propostas_pronon_radar.py` possuem regras
parcialmente sobrepostas, além de classificadores distintos no frontend. O caso mais perigoso é
o valor fixo “Acelerador linear” na carga programática, que não comprova o equipamento de cada
registro. No PRONON manual, o equipamento curado também pode divergir dos itens da API e somente
um equipamento é persistido.

O risco foi incorporado ao Plan Mode de centralização: primeiro inventário e dry-run, depois
classificador único e backfill idempotente, e só então migração dos contratos para
Repository → Service → Router. Até a execução, os marcadores legados não são fonte confiável de
confirmação de aquisição.

### Execução 2026-09-20

O classificador canônico passou a morar em `app/equipamentos.py`; importadores e descoberta
TransfereGov registram evidência central pelo serviço idempotente. As listagens de Convênios e
Propostas carregam marcadores em lote, sem N+1, e o filtro de equipamento de Convênios usa
`EXISTS` sobre a relação central. O classificador anterior de primeiro termo e a atribuição fixa
de Acelerador Linear a PERSUS II/PRONON deixaram de ser fonte de marcador.
