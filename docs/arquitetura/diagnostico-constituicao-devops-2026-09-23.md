# Diagnóstico sênior — Constituição DevOps (2026-09-23)

## Escopo e método

Esta rodada compara a infraestrutura versionada com
`padroes/devops/constituicao_devops.md` e sucede o diagnóstico de 16/09.
Foram revisados workflows, configuração Render/Vercel, health, logs, lockfiles,
segredos declarados, artefatos e comandos que a CI promete executar. A
revalidação de execução acessou GitHub, Render, Neon e Vercel em 23/09.
Configuração externa sem evidência continua **não
comprovada**, não presumidamente inexistente.

## Resultado executivo

**Conformidade atual: 8,0/10** (ante 3,5/10 em 16/09). O projeto tem CI de
backend e frontend verde, ambiente `Production` no GitHub, jobs produtivos
serializados e protegidos, deploy Render condicionado a CI, boot sem DDL e
health check real em `/health`. O compose foi validado integralmente no
OrbStack, incluindo Postgres isolado, health e encerramento limpo.

Ainda faltam política de retenção, teste de restauração, RPO/RTO formal e
proteção nativa de branch no GitHub. A janela PITR atual do Neon é somente
seis horas; esse é o risco operacional principal.

| Eixo | Nota | Evidência versionada |
|---|---:|---|
| Reprodutibilidade e containerização | 9,0 | Dockerfile multi-stage, `.dockerignore`, compose e exemplo OrbStack existem; smoke completo executou como usuário não-root, com Postgres local isolado, health e shutdown limpo. |
| CI e supply chain | 8,5 | CI frontend e backend concluídas com sucesso no commit publicado; backend usa Postgres efêmero, Alembic, testes e audit; `actionlint` passa e virou gate com imagem por digest. Ainda faltam CodeQL, secret scan, SBOM e scan de imagem. |
| Migration e jobs de dados | 8,0 | Workflows usam `Production`, timeout, concurrency compartilhada, checkout de `master` e falham sem segredo. Migration está fora do boot do Render. |
| Deploy e rollback | 8,0 | Render faz deploy após CI, tem build fixado, health check `/health`, boot sem DDL e runbook. Vercel recebeu smoke E2E autenticado com sucesso. Faltam staging, artefato de imagem e rollback ensaiado. |
| Observabilidade | 6,5 | Health faz `SELECT 1`; middleware gera log JSON HTTP com duração e `trace_id`; Render avisa falhas por e-mail e o Vercel expõe métrica básica. Faltam coleta/retenção, métricas completas, tracing, dashboard e monitor externo. |
| Segurança de infraestrutura | 8,0 | Ambiente GitHub `Production` restringe jobs a `master`, sem bypass administrativo, com segredos separados; Render tem `JWT_SECRET`, `DATABASE_URL` e `CORS_ORIGINS`. Branch protection nativa do GitHub continua indisponível no plano atual. |
| Recuperação e custo operacional | 5,0 | Neon comprova PITR, mas somente por seis horas; não há RPO/RTO, retenção ampliada ou restore ensaiado. |

## Evidências executadas

```text
YAML dos workflows e render.yaml                     → sintaxe válida
GitHub Actions (commit c92bf11)                     → Frontend CI e Backend CI e segurança: sucesso
Render (commit c92bf11)                             → deploy live; GET /health: 200
Render                                               → uv 0.12.17 fixado; Uvicorn sem Alembic no boot
Render                                               → notificações de falha do serviço ativadas por e-mail
Neon                                                 → PITR disponível; janela de 6 horas
OrbStack                                             → imagem `sigeo-backend:dev` construída; usuário `sigeo` e health check presentes
OrbStack (compose `sigeo-devops-smoke`)               → Postgres saudável, `/health` 200 com banco conectado, UID 10001; containers/rede/volume removidos ao final
Vercel                                               → produção pronta, `master`/`c92bf11`, domínio padrão ativo; 0% de erro em 6 h
Vercel                                               → redeploy `26RKeA7N` pronto com `VITE_API_BASE_URL` em Production/Preview
Vercel                                               → deploy `85bAN8ZzHMhA9oHfncmRnoKuVG18` pronto a partir de `master`/`1b4f9af`
E2E publicado                                        → login aprovado; rota protegida carregou 560 instrumentos
Preflight CORS                                       → origem Vercel autorizada, credenciais e métodos esperados
GitHub Actions monitor (run 35904108197)             → `/health` concluído com sucesso
actionlint 1.7.10                                    → sete workflows validados localmente; gate usa digest imutável
```

Os YAMLs são parseáveis e passaram no `actionlint` 1.7.10. O Render CLI
continua ausente; a execução real no Render confirmou o Blueprint aplicado no
serviço e o health check HTTP.

## Avanços desde 16/09

- `.github/workflows/backend_ci.yml` executa `uv sync --frozen`, Ruff, mypy,
  pytest e `pip-audit`; `frontend_ci.yml` executa `npm ci`, audit, lint,
  typecheck, testes e build em push/PR. Ambos usam permissões mínimas,
  concorrência por ref e actions fixadas por SHA.
- `workflow_lint.yml` valida sintaxe e semântica dos workflows em push/PR que
  os alterem, com `actionlint` fixado por digest OCI.
- `render.yaml` não executa mais Alembic no `startCommand`; os workflows de
  pipelines e Radar também não executam DDL. `migrar_banco.yml` é o único
  fluxo versionado que chama `alembic upgrade head`.
- O backend tem `/health` com conectividade real ao Postgres, cabeçalhos de
  segurança e middleware que devolve/propaga `X-Trace-Id` e emite eventos JSON
  de request e chamadas externas, sem querystring ou corpo sensível.
- `backend_ci.yml` fixa `actions/checkout` e `setup-uv` por SHA; o frontend
  também fixa `checkout` e `setup-node` e ambos restringem permissões.

## Evidência externa confirmada em 23/09

- GitHub: environment `Production` com deploy exclusivo de `master`, sem
  bypass administrativo; segredos `DATABASE_URL` e `DATABASE_URL_MIGRATION`
  cadastrados. A proteção nativa de branch não pôde ser habilitada no plano
  atual do repositório privado.
- Render: `JWT_SECRET` foi cadastrado como segredo; build fixado em
  `uv==0.12.17`; deploy ocorre após CI; `startCommand` executa somente
  Uvicorn; `healthCheckPath=/health` foi validado com respostas 200.
- Neon: branch `production` é a padrão e oferece PITR, com histórico de seis
  horas. Nenhuma restauração foi executada e não houve alteração de plano.
- Vercel: projeto `par-equipamentos` publicou `master` no commit `c92bf11`,
  está pronto no domínio padrão e reportou 17 requisições de borda e 0% de
  erro nas últimas seis horas. A variável pública `VITE_API_BASE_URL` foi
  corrigida (antes registrada indevidamente como segredo), passou a apontar
  para a API Render em Production/Preview, e o redeploy `26RKeA7N` ficou
  pronto. O deploy posterior `85bAN8ZzHMhA9oHfncmRnoKuVG18`, originado em
  `master`/`1b4f9af`, também ficou pronto. Analytics ainda não está ativado;
  alertas de anomalia exigem plano pago.
- Smoke E2E: o login no domínio publicado foi aprovado e a rota protegida
  carregou a listagem de 560 instrumentos. O preflight da API retornou origem
  Vercel, credenciais, métodos e cabeçalhos esperados. O `CORS_ORIGINS` já
  continha a origem de produção e foi preservado, sem sobrescrever o preview.

## Achados prioritários

### P1 — recuperação ainda insuficiente

O Neon confirma apenas seis horas de PITR. Não há RPO/RTO aprovados, backup
externo, retenção ampliada ou exercício de restauração. Ampliar a janela exige
mudança de plano/custo e deve ser decidido antes de alterar o serviço.

### P1 — entrega ainda sem artefato promovível

O Render espera os checks de CI, executa health check e mantém DDL fora do
boot, mas ainda recompila o código no provedor. O smoke autenticado publicado
foi aprovado, porém não há imagem por SHA, staging ou rollback ensaiado. A
mudança de aplicação deve continuar separada de qualquer rollback de schema.

### P1 — primeiro acesso pode exceder o timeout do cliente

O serviço Free do Render precisou acordar e excedeu os 15 segundos definidos
no cliente HTTP; o frontend exibiu a ação de tentar novamente. Após a API ficar
disponível, o mesmo smoke E2E passou. Para não depender da intervenção do
usuário no primeiro acesso, é preciso adotar instância sem cold start ou
implementar retentativa/estado de aquecimento apropriado.

O cliente agora repete uma única vez apenas leituras `GET`/`HEAD` que tenham
atingido o timeout interno; mutações nunca são repetidas, evitando duplicidade
de escrita. A medida reduz a fricção do cold start, mas não remove o risco de
disponibilidade da instância Free.

Como mitigação transitória, o workflow `monitor-render-health.yml` consulta
`/health` a cada cinco minutos, com retentativas e execução manual. O cron usa
minutos fora do topo da hora e só passa a executar quando estiver publicado na
branch padrão. Ele reduz cold starts enquanto a API permanecer no Render Free,
mas não constitui garantia: o GitHub pode atrasar jobs agendados e o Render
continua podendo reiniciar a instância. A primeira execução manual publicada
(`35904108197`) concluiu com sucesso.

### Resolvido — container local validado com Postgres isolado

Dockerfile multi-stage, usuário não-root, `.dockerignore`, compose e exemplo
de ambiente OrbStack foram criados. Em 23/09, o compose temporário
`sigeo-devops-smoke` subiu com Postgres saudável; a API respondeu
`{"status":"ok","database":"connected"}` em `/health` e seu processo
rodou como UID `10001`/usuário `sigeo`. Ao final, containers, rede e volume
desse projeto foram removidos, confirmando também o shutdown limpo. O arquivo
de ambiente usado tinha valores sintéticos locais e foi apagado.

### P1 — observabilidade termina no stdout da aplicação

Os eventos estruturados são um avanço real e o Render agora envia alertas de
falha por e-mail. Ainda não há coletor, retenção, métricas p50/p95/p99, uso de
recurso, tracing entre frontend/backend/jobs, dashboard, monitor externo ou
matriz de severidade. Logs no painel do Render não são suficientes como
política operacional versionada.

### P1 — CI não testa o caminho de banco nem toda a supply chain

Backend CI agora provisiona PostgreSQL e executa Alembic/testes nesse caminho.
Ainda faltam CodeQL, secret scan, SBOM e scan de imagem; os pins por SHA devem
ser completados no frontend e nos fluxos restantes.

### P2 — contexto e artefatos de entrega

A reinspeção do Blueprint confirmou que não há campos raiz `release:` ou
`web:` em `render.yaml`; a suspeita inicial resultava de uma leitura
concatenada com arquivos auxiliares e foi descartada. Persistem snapshots rastreados de até
15 MB, incluindo dados brutos e saídas de scripts. Nenhum foi removido nesta
rodada porque há consumidores e valor de auditoria a confirmar.

## Itens não comprovados externamente

- Staging e segredos próprios desse ambiente; proteção nativa de branch e MFA
  dos administradores GitHub/Render/Neon.
- Retenção de logs, métricas, tracing, domínio customizado/TLS e política de
  preview no Vercel.
- Backup externo, retenção PITR maior que seis horas, restauração testada, RPO
  e RTO aprovados.
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
- [x] GitHub, Render e Neon auditados com acesso apropriado.
- [x] Blocos de CI, jobs produtivos, containerização declarativa e deploy
  seguro executados; pendências de custo e observabilidade registradas.
