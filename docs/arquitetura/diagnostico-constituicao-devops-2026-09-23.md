# Diagnóstico sênior — Constituição DevOps (2026-09-23)

## Escopo e método

Esta rodada compara a infraestrutura versionada com
`padroes/devops/constituicao_devops.md` e sucede o diagnóstico de 16/09.
Foram revisados workflows, configuração Render/Vercel, health, logs, lockfiles,
segredos declarados, artefatos e comandos que a CI promete executar. Não foram
acessados painéis de GitHub, Render, Vercel ou Neon: configuração externa sem
evidência no repositório é **não comprovada**, não presumidamente inexistente.

## Resultado executivo

**Conformidade atual: 6,3/10** (ante 3,5/10 em 16/09). O projeto deixou de
estar sem gates: CI de backend e frontend foi versionada, as migrations saíram
do boot e dos jobs de dados, existe uma credencial específica de migration por
convenção, e a API passou a emitir logs JSON com `trace_id` e duração.

Ainda não há uma cadeia de entrega protegida até produção: não existe
containerização, CD versionado, environment de produção, promoção de artefato,
smoke test, rollback ou observabilidade operacional completa. O risco mais
importante continua sendo aplicar DDL ou rodar jobs contra Neon a partir de uma
ref manual sem aprovação, serialização, timeout ou evidência de backup.

| Eixo | Nota | Evidência versionada |
|---|---:|---|
| Reprodutibilidade e containerização | 2,0 | Lockfiles existem, mas não há Dockerfile, `.dockerignore`, compose ou imagem rastreável. OrbStack está instalado localmente, porém parado; nenhum build de imagem foi executado nesta rodada. |
| CI e supply chain | 7,0 | CI separada para backend/frontend, cache npm, lockfiles e audit de dependências. Backend fixa actions por SHA; workflows restantes ainda usam tags/`latest`, não há CodeQL, secret scan, SBOM ou scan de imagem. |
| Migration e jobs de dados | 5,5 | Migration está isolada do boot e dos jobs DML, mas o workflow manual ainda não usa environment, timeout, concurrency, ref restrita, backup ou falha explícita se faltar segredo. |
| Deploy e rollback | 3,0 | Render/Vercel são configurados em parte, mas não há CD, aprovação, artefato por SHA, staging, smoke test ou runbook/rollback comprovado. |
| Observabilidade | 6,0 | Health faz `SELECT 1`; middleware gera log JSON HTTP com duração e `trace_id`; faltam coleta/retenção comprovadas, métricas, tracing distribuído, dashboard e alertas. |
| Segurança de infraestrutura | 6,8 | `.env` é ignorado, candidatos a segredos rastreados não foram encontrados e CI de aplicação usa `permissions: read-all`; faltam environments, separação comprovada de secrets, scan de imagem e hardening completo de supply chain. |
| Recuperação e custo operacional | 3,5 | Não há RPO/RTO, backup/PITR, restore testado ou política de retenção versionados. Há snapshots grandes rastreados, sem política de redução/retenção. |

## Evidências executadas

```text
YAML dos 5 workflows e render.yaml                  → sintaxe válida
backend: ruff check .                               → passou
backend: mypy .                                     → passou (175 fontes; 2 avisos de funções de teste não tipadas)
backend: pytest -q                                  → 194 testes descobertos; testes que exigem TEST_DATABASE_URL seguem pulados sem PostgreSQL dedicado
frontend: lint + typecheck + test + build           → passou (21 arquivos, 78 testes)
busca de segredo em arquivos rastreados             → 0 candidatos encontrados
Dockerfile/.dockerignore/compose/deploy workflow    → ausentes
OrbStack                                            → instalado, parado
```

Os cinco YAMLs são parseáveis. A validação semântica completa de GitHub Actions
(`actionlint`) e de Blueprint Render não foi executada: `actionlint` e Render
CLI não estão instalados neste ambiente. A documentação oficial do Render
confirma que `healthCheckPath` é a forma declarativa de ativar a verificação
HTTP de prontidão; o arquivo atual não o declara. [Render Blueprint]
(https://render.com/docs/blueprint-spec) e [health checks]
(https://render.com/docs/health-checks).

## Avanços desde 16/09

- `.github/workflows/backend_ci.yml` executa `uv sync --frozen`, Ruff, mypy,
  pytest e `pip-audit`; `frontend_ci.yml` executa `npm ci`, audit, lint,
  typecheck, testes e build em push/PR.
- `render.yaml` não executa mais Alembic no `startCommand`; os workflows de
  pipelines e Radar também não executam DDL. `migrar_banco.yml` é o único
  fluxo versionado que chama `alembic upgrade head`.
- O backend tem `/health` com conectividade real ao Postgres, cabeçalhos de
  segurança e middleware que devolve/propaga `X-Trace-Id` e emite eventos JSON
  de request e chamadas externas, sem querystring ou corpo sensível.
- `backend_ci.yml` fixa `actions/checkout` e `setup-uv` por SHA e define
  `permissions: read-all`; frontend CI também restringe permissões.

## Achados prioritários

### P0 — operação de banco sem proteção de ambiente

`migrar_banco.yml`, `pipelines.yml` e `radar_convenios.yml` não têm
`environment`, `concurrency` ou `timeout-minutes`. A ausência de
`DATABASE_URL`/`DATABASE_URL_MIGRATION` faz os passos seguintes serem pulados e
o job pode terminar verde. Como `workflow_dispatch` aceita a ref selecionada
pelo operador, uma revisão não integrada pode atingir o banco compartilhado.

**Correção requerida:** ambiente GitHub `production` com reviewers e branch
principal restrita; segredos por ambiente; falha explícita quando o segredo não
existir; grupo de concorrência único para migrations e grupos próprios para
pipelines/Radar; timeout calibrado; checkout explícito de `master` para ações
contra produção. GitHub documenta que `concurrency` serializa execuções e que
environment protections bloqueiam o job antes do runner. [Documentação GitHub]
(https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

### P0 — deploy não é consequência comprovada de CI

Não existe workflow de CD, environment, promoção de artefato/imagem por SHA ou
smoke test pós-deploy. `render.yaml` não fixa `autoDeployTrigger: checksPass`
nem `healthCheckPath: /health`; para serviços novos, o padrão documentado pelo
Render é deploy a cada commit quando esse campo é omitido. Em serviço já
existente, o valor efetivo só pode ser confirmado no painel.

**Correção requerida:** declarar deploy após CI, com aprovação de produção,
artefato rastreável, health/smoke test e rollback ao SHA anterior. Não acoplar
migration destrutiva ao rollback de aplicação.

### P1 — ausência de containerização reproduzível

Não há Dockerfile, `.dockerignore` ou compose. O backend nativo instala `uv`
via `pip install uv` no build do Render, sem versão fixada no blueprint. Isso
impede validar a imagem, usuário não-root e health check pelo mecanismo exigido
na constituição. OrbStack deve ser o runtime local para essa etapa, conforme a
decisão do projeto; não iniciar ou migrar o deploy para Docker sem plan-mode
aprovado.

### P1 — observabilidade termina no stdout da aplicação

Os eventos estruturados são um avanço real, mas não há coletor, retenção,
métricas p50/p95/p99, uso de recurso, tracing entre frontend/backend/jobs,
dashboard, monitor externo ou alerta com destino e severidade. Logs no painel
do Render podem existir, mas não são comprovados nem suficientes como política
operacional versionada.

### P1 — CI não testa o caminho de banco nem toda a supply chain

Backend CI não provisiona PostgreSQL nem `TEST_DATABASE_URL`, logo a parcela de
testes de integração/migrations marcada como dependente de banco permanece
pulada. Não há cache explícito de `uv`, CodeQL, secret scan, SBOM ou scan de
imagem. `frontend_ci.yml`, migration e jobs operacionais usam actions por tag
ou `latest`, em contraste com o pin por SHA já aplicado no backend.

### P2 — contexto e artefatos de entrega

A reinspeção do Blueprint confirmou que não há campos raiz `release:` ou
`web:` em `render.yaml`; a suspeita inicial resultava de uma leitura
concatenada com arquivos auxiliares e foi descartada. Persistem snapshots rastreados de até
15 MB, incluindo dados brutos e saídas de scripts. Nenhum foi removido nesta
rodada porque há consumidores e valor de auditoria a confirmar.

## Itens não comprovados externamente

- Segredos distintos para desenvolvimento, staging e produção; reviewers e
  branch protection de GitHub; configuração real de `JWT_SECRET` e
  `CORS_ORIGINS` no Render.
- `autoDeployTrigger`, health check, logs/retenção, alertas e rollback no
  Render; domínio/TLS e deploy/preview no Vercel.
- Plano Neon, PITR, backup, retenção, restauração testada, RPO e RTO.
- Permissões de consoles cloud, MFA e trilha de auditoria de deploy.

## Limpeza e contexto

Não foram removidos arquivos de infraestrutura: nenhum Docker/compose morto
existe para apagar e os artefatos grandes ainda requerem mapa de consumidores.
`.env`, caches de banco local e logs de processo estão corretamente ignorados.
O diagnóstico de 16/09 permanece como fotografia histórica; este arquivo é a
referência operacional atual para DevOps.

## Próximo passo recomendado

Criar um plan-mode DevOps em seis blocos: (1) proteger workflows e banco;
(2) Dockerfile backend + `.dockerignore` + compose testados via OrbStack;
(3) CI com PostgreSQL efêmero, scan e actions fixadas; (4) CD/deploy, health,
smoke e rollback; (5) observabilidade e alertas; (6) backup/RPO/RTO e redução
segura de artefatos. Cada bloco deve declarar ambiente, segredos, custo,
estratégia de rollout e rollback antes de qualquer alteração.

## Critério de fechamento desta rodada

- [x] Constituição e diagnóstico anterior confrontados com o repositório.
- [x] Workflows, deploy declarativo, health, logs, segredos e artefatos
  revisados.
- [x] Gates locais disponíveis executados e resultado registrado.
- [x] Arquivos/comentários potencialmente mortos identificados sem remoção
  insegura.
- [ ] Painéis e ambientes externos auditados com acesso apropriado.
- [ ] Infraestrutura corrigida por plan-mode próprio aprovado.
