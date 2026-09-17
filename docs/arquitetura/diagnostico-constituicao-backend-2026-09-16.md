# Reavaliação da Constituição Backend — 2026-09-17

## Escopo e método

Esta reavaliação substitui o diagnóstico inicial de 2026-09-16 e considera os Plan Modes de database e segurança já implementados. Foram confrontados o código atual e `padroes/backend/constituicao_backend.md`, com inspeção das rotas, Services, Repositories, contratos, autenticação, migrações, workflows e testes. O Neon também foi consultado diretamente, sem leitura de dados de negócio.

## Resultado executivo

**Conformidade backend: 7,0/10** (antes: 6,5/10).

O avanço é real: autenticação por cookie HttpOnly, refresh token rotativo, rate limit, headers, CORS validado, autorização de monitoramento no Service, papéis de banco separados e migrações manuais corrigiram os maiores riscos do diagnóstico original. O backend, porém, ainda não cumpre sua própria arquitetura: a maior parte das queries continua nos routers; Services acessam SQLAlchemy e levantam `HTTPException`; não existe hierarquia de erro de domínio, envelope unificado, paginação universal, observabilidade estruturada ou gates de lint/typecheck/coverage.

O próximo bloco deve ser a fundação backend, começando por uma feature pequena e preservando contratos. Migrar todo o backend de uma vez elevaria o risco de regressão sem produzir valor proporcional.

## Nota por eixo

| Eixo | Nota | Evidência principal |
|---|---:|---|
| Segurança de fronteira | 8,0 | Cookie HttpOnly, refresh rotativo, rate limit, CORS e headers; ainda há CSRF e concorrência no refresh |
| Banco e transação | 8,0 | Neon em `f8fe7ce9347c`, runtime sem DDL, índice trigram e TLS no driver |
| Arquitetura em camadas | 4,0 | Apenas 1 Repository; routers e Services ainda consultam SQLAlchemy |
| Contratos e validação | 6,5 | Pydantic e `response_model`; formatos não envelopados e payload externo genérico |
| Resiliência e volume | 6,0 | Timeouts/retries e algumas paginações; listas ilimitadas e race no refresh |
| Testes e gates | 6,0 | 116/117 testes executados passaram; ruff, mypy e cobertura ausentes |
| Observabilidade | 3,0 | Handler global existe; faltam JSON, trace, duração e métricas |
| Código morto/organização | 6,5 | Remoções recentes; três schemas sem consumidor e responsabilidades ainda concentradas |

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

## Achados pendentes

### P0 — segurança e operação

1. **Autenticação por cookie sem defesa CSRF explícita.** Com `SameSite=None`, falta token CSRF ou validação forte de `Origin` nas rotas mutáveis. JSON com preflight reduz parte da superfície, mas refresh e logout são POSTs sem corpo e continuam acionáveis entre sites.
2. **Rotação de refresh não é atômica sob concorrência.** A consulta do token não usa `SELECT ... FOR UPDATE` nem atualização condicional. Duas requisições simultâneas podem validar o mesmo token antes de ambas o revogarem e criarem dois sucessores.
3. **Seleção silenciosa da URL de migration.** `Settings.database_url_alembic` prefere `DATABASE_URL_MIGRATION` carregada do `.env`, mesmo quando `DATABASE_URL` é sobrescrita no comando. Isso fez um comando planejado para o PostgreSQL local atingir o Neon. A interface precisa exigir seleção explícita do alvo ou impedir fallback silencioso em ambiente local/CI.
4. **Rollback final inválido em banco populado.** O downgrade de `f8fe7ce9347c` recria `cpf_hash` como `NOT NULL` sem default/backfill. Ele falhará se `user` tiver linhas, contrariando a reversibilidade exigida.

### P1 — arquitetura

1. A aplicação permanece majoritariamente `Router -> SQLAlchemy`. Há queries diretas em praticamente todos os routers de domínio.
2. Existe só um Repository de domínio (`propostas_candidatas`).
3. Os Services de monitoramento recebem `Session`, executam query e importam `HTTPException`; logo não são casos de uso isolados da web e do banco.
4. Commits continuam divididos entre routers e Services. A fronteira transacional não está padronizada.
5. `monitoramento.py` ainda concentra cerca de 767 linhas; oferta de equipamentos, convênios e coberturas também mantêm consulta e regra no controller.
6. Schemas vivem tanto em `app/schemas.py` quanto dentro de routers, sem organização por feature.

### P1 — contratos, listas e integrações

1. Sucessos ainda retornam objetos/listas crus e erros usam `{error, detail}`; falta o envelope constitucional. A mudança é breaking e deve ser coordenada com o frontend ou versionada.
2. Listas de macro, município, região de saúde, instrumentos, ações, marcos e facilities ainda não possuem paginação/teto coerente.
3. Integrações externas mantêm `dict[str, Any]` e não validam todos os payloads antes de entrar no domínio.
4. O login ainda devolve `access_token` no corpo e mantém bearer fallback, apesar de o frontend já operar por cookie. A compatibilidade amplia a exposição do token e deve ter prazo de remoção.
5. Logout revoga o refresh, mas o access token emitido continua válido por até 20 minutos; falta vínculo de sessão/JTI caso revogação imediata seja requisito.

### P2 — qualidade e observabilidade

1. Não há `ruff`, `mypy`, cobertura mínima ou CI de aplicação configurados.
2. Faltam logs JSON com `trace_id`, usuário, endpoint e `duration_ms`.
3. Não há métrica de duração de query/chamada externa nem alerta operacional.
4. `/docs` e `/openapi.json` permanecem públicos; isso deve ser uma decisão explícita por ambiente.
5. O rate limit em memória é por processo e não coordena múltiplas instâncias.
6. Permanecem warnings de depreciação Starlette/httpx e FastAPI 422.

### Código morto comprovável

- `UserCreate`, `TokenPayload` e `ErrorResponse` não têm consumidores no código atual e são candidatos seguros à remoção após confirmação por teste.
- `require_monitoramento_editor` continua usado e não é código morto.
- Scripts operacionais não foram classificados como mortos apenas por não serem importados; são entrypoints manuais e exigem prova de substituição antes de exclusão.

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

## Execução (2026-09-17, Plan Mode backend)

`planmode-backend-2026-09-17.md`, Bloco 1 do "próximo bloco recomendado" acima, foi implementado
por inteiro (Blocos A-E do plano):

- `DomainError`/`NotFoundError`/`ConflictError`/`ValidationError`/`AuthorizationError`
  (`app/domain_errors.py`, novo) + tradutor central em `app/errors.py`. Migrados: `app/authz.py` e
  `app/services/propostas_candidatas.py` — únicos consumidores reais de erro em Service até então.
- Contrato Repository/Service documentado em `padroes/backend/constituicao_backend.md` Seção 3, com
  `propostas_candidatas` como exemplo citável.
- `notificacoes` migrado Router → Service → Repository (`app/repositories/notificacoes.py`,
  `app/services/notificacoes.py`, novos; `app/routers/notificacoes.py` ficou fino) — contrato HTTP
  preservado, testes de contrato (router) e unitário (service) passando.
- `ErrorResponse`/`UserCreate`/`TokenPayload` removidos de `app/schemas.py` (zero consumidor,
  reconfirmado por grep antes de remover).
- `ruff`/`mypy` configurados em `pyproject.toml` (`E`/`F`/`I`, sem `strict`) com baseline versionada
  (`.ruff-baseline.json` — 222 achados legados; `.mypy-baseline.json` — 80 achados legados). Todo
  arquivo tocado neste bloco (`domain_errors.py`, `repositories/notificacoes.py`,
  `services/notificacoes.py`, `routers/notificacoes.py`, `authz.py`, `services/propostas_candidatas.py`,
  `errors.py`, `schemas.py`) está limpo em ambos, sem entrada na baseline.

Escopo intocado, como o plano previa: `monitoramento.py`/services de monitoramento continuam
levantando `HTTPException` direto e commitando fora do padrão-alvo; achado legado de ruff/mypy fora
dos arquivos acima não foi corrigido (baseline existe exatamente pra não travar nisso agora); CSRF
(P0 restante) segue fora, é escopo de segurança & auth.

`pytest -m 'not db'`: 53 passed (era 47 — 6 testes novos: `test_errors.py` completo +
`test_service_notificacoes.py`, gated do mesmo jeito que os demais módulos que encostam em banco
real). Suíte completa não rodada contra banco dedicado nesta sessão (sem `TEST_DATABASE_URL`
configurada) — só os testes que já rodavam sem banco foram usados pra confirmar paridade de
contrato HTTP/status. Rodar `pytest -m db` com `TEST_DATABASE_URL` antes do próximo deploy pra
confirmar os testes de banco (`test_errors.py` não depende de banco; `test_notificacoes.py`,
`test_propostas_candidatas.py`, `test_monitoramento.py`, `test_service_notificacoes.py` dependem).
