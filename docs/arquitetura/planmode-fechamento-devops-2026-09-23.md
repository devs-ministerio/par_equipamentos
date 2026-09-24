# Plan Mode — Fechamento da Constituição DevOps (2026-09-23)
## Objetivo
- Fechar os achados de 23/09: entrega bloqueante, banco seguro,
  containerização local, observabilidade, recuperação e contexto limpo.
- Preservar Neon, Render e Vercel; OrbStack é o runtime local de containers.

## Escopo e pré-condições
- Alterar workflows, `render.yaml`, Dockerfile backend, `.dockerignore`,
  compose local, runbooks e documentação operacional.
- Confirmar acesso administrativo a GitHub/Render/Vercel/Neon; criar
  environments e cadastrar secrets fora do Git. Staging exige aprovação/custo.
- Não fazer deploy, DDL produtivo, rotação de segredo ou remoção de snapshot
  sem aprovação explícita, backup confirmado e janela operacional definida.

## Etapas
1. Validar Blueprint Render; remover somente configuração raiz sem consumidor
   comprovado (`release`/`web`); reduzir comentários históricos; adicionar actionlint.
2. Proteger migration, pipelines e Radar: permissões mínimas, timeout,
   concurrency, environment `production`, checkout `master` e falha se
   segredo faltar; grupos impedem corrida entre jobs e DDL.
3. Completar CI: actions por SHA, cache uv, Postgres efêmero, Alembic/testes
   `db`, audit, secret scan e relatório; bloquear PR em lint/tipo/teste/build/CVE crítica.
4. Containerizar backend: multi-stage, versões fixas, não-root, health check,
   `.dockerignore` e compose com Postgres/volume/env; validar build, `/health`
   e shutdown via OrbStack.
5. Criar CD separado: `healthCheckPath: /health`, checks prévios, artefato SHA,
   aprovação produtiva, smoke test e rollback da aplicação; DDL segue independente.
6. Configurar coleta de logs JSON, métricas/uptime, dashboard e alertas;
   documentar Neon PITR, backup, RPO/RTO, restore, deploy e falha de migration.
7. Mapear consumidores de snapshots antes de retenção/remoção; revalidar
   workflows/imagem/smoke e atualizar diagnóstico, nota, AGENTS/README e runbooks.

## Riscos, rollout e aceite
- Mitigar gate indevido, corrida, downtime, DDL incompatível, custo e perda de
  snapshot com rollout gradual, timeout, backup, approval e rollback testado.
- Rollback retorna a aplicação ao SHA anterior; schema não faz downgrade
  automático e falha de DDL segue runbook/restauração aprovada.
- Aceite: CI com Postgres verde; imagem OrbStack saudável/não-root; produção
  protegida; deploy/smoke/rollback, alertas e backup comprovados; sem segredo
  ou artefato morto no Git.

## Estado de execução em 23/09/2026

As etapas versionáveis 1–7 foram executadas: workflows e gates, compose
OrbStack, imagem não-root, deploy com health, observabilidade, retenção,
inventário de consumidores e atualização do diagnóstico/runbooks. O dashboard
`SIGEO — Operação de Produção` também recebeu CPU e memória física emitidas
pelo agente Python; limiares de capacidade só serão aprovados após sete dias
de linha de base representativa.
O frontend e a API também passaram a correlacionar cada operação por um
`X-Trace-Id` opaco validado, inclusive no retry seguro, sem carregar dados de
usuário ou querystring.

## Encerramento

**Status: concluído — 100% do escopo versionável e sem custo.**

Não são pendências de implementação local: backup externo ou PITR superior a
seis horas, registry/staging e promoção de imagem, rollback ensaiado,
redundância geográfica do Ping, tracing de frontend/jobs e proteção nativa de
branch/CodeQL dependem de plano, franquia ou configuração administrativa dos
provedores. Elas foram classificadas como pendências externas/de custo no
diagnóstico e não serão implicitamente tratadas como concluídas por alterações
no repositório.
