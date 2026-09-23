# Runbook DevOps — SIGEO

## Produção antes de migration ou job

1. No GitHub, configure o environment existente `Production`, restrinja-o a `master` e exija
   aprovação de um responsável.
2. Cadastre nele `DATABASE_URL` (role `sigeo_runtime`) e
   `DATABASE_URL_MIGRATION` (role `sigeo_migration`); nunca reutilize nem
   imprima esses valores.
3. Confirme snapshot/PITR do Neon e a compatibilidade expand-contract antes de
   disparar `Migrar banco`.
4. Aguarde a revisão Alembic, execute a migration e confira `alembic current`.
   Só então autorize deploy e jobs de dados.

## Deploy e rollback

1. Render deve usar `autoDeployTrigger: checksPass` e `/health`; Vercel só
   recebe o frontend depois de CI verde.
2. Após deploy, faça smoke test autenticado e `GET /health`; registre SHA,
   horário e operador.
3. Se o smoke falhar, retorne a aplicação ao SHA anterior. Não faça downgrade
   automático do banco: siga o plano de restauração aprovado.
4. O gate `SBOM e segurança da imagem` publica `sigeo-backend-image-<SHA>`
   por 30 dias, junto do SBOM do mesmo SHA. Antes de qualquer promoção futura,
   baixe o artefato, execute `docker load` em ambiente isolado e faça
   `/health`; o Render atual ainda recompila o código e não consome esse
   artefato diretamente. Não chame esse processo de promoção até haver um
   registry e staging aprovados.
   O primeiro smoke deste fluxo foi feito no OrbStack para o SHA `946ac4c`:
   imagem carregada do GitHub, Postgres descartável, `/health` com banco
   conectado e processo com UID 10001. Ao final, containers, rede, arquivo
   baixado e imagem local foram removidos.

## Desenvolvimento com OrbStack

1. Copie `backend/.env.orbstack.example` para `.env.orbstack`, preencha apenas
   valores locais e mantenha o arquivo fora do Git.
2. Use `docker compose up --build`; o Docker CLI é servido pelo OrbStack.
3. Aplique migrations localmente com a URL do Postgres do compose antes de
   testar rotas dependentes de schema; valide `http://localhost:8000/health`.
4. Para um smoke descartável, use um project name isolado (por exemplo,
   `docker compose -p sigeo-devops-smoke up --build --detach`), confira
   `docker compose -p sigeo-devops-smoke ps`, `/health` e o usuário `sigeo`.
   Finalize com `docker compose -p sigeo-devops-smoke down --volumes` para não
   preservar dados locais de validação.

## Validação de workflows

`Validar workflows` executa `actionlint` em toda alteração de
`.github/workflows/`, com imagem OCI fixada por digest. Antes de publicar
mudanças nos workflows, rode o mesmo comando do job ou confirme o gate verde
no GitHub Actions.

## Observabilidade e recuperação

- O New Relic é o destino central de APM. No Render, mantenha
  `NEW_RELIC_LICENSE_KEY` somente como segredo e defina
  `NEW_RELIC_APP_NAME=SIGEO API`; não versionar nem imprimir a chave. O
  `start-server.sh` ativa o agente Python apenas quando a chave existe, e o
  mesmo comando funciona em Docker e no futuro Railway.
- Depois de cada alteração de instrumentação, confirme no New Relic a entidade
  APM `SIGEO API`, uma transação HTTP e o health do serviço. Alertas de erro,
  latência e disponibilidade só são considerados configurados após terem
  destinatário, severidade e condição documentados no New Relic.
- Logs JSON do backend continuam no stdout; sua retenção e correlação devem
  ser configuradas pelo pipeline de logs do provedor, sem enviar corpos,
  querystrings ou segredos.
- Objetivo operacional aprovado enquanto o plano atual do Neon for mantido:
  **RPO de até 6 horas** (a janela PITR contratada) e **RTO de até 4 horas**
  para recuperar uma branch isolada e comprovar sua integridade. Isso não é
  substituto de backup externo nem cobre uma janela maior que o PITR.
- Para o exercício semestral, registre início, timestamp de recuperação, fim e
  operador; crie uma branch temporária a partir de um ponto PITR, nunca sobre
  `production`, com expiração automática de no máximo um dia. Faça somente
  consultas de leitura nela: conectividade, `alembic_version` e inventário
  esperado de tabelas. Compare a revisão com `production` e anote qualquer
  diferença deliberada. A exclusão antecipada da branch de teste requer nova
  aprovação, pois é uma ação destrutiva.
- Exercício de 23/09/2026: a branch
  `sigeo-restore-drill-2026-09-23` foi criada de `production` no ponto
  13:37 America/Sao_Paulo, validada antes de 16:42 e configurada para expirar
  em um dia. A revisão Alembic foi `b7e3d9f4a621`, igual à produção, e o
  inventário funcional foi de 27 tabelas. A branch continha uma tabela extra
  (`playing_with_neon`) criada pelo exemplo inicial do editor; ela não existe
  em produção e expira junto da branch. Não houve escrita nem alteração na
  branch de produção.
- Não remova snapshots versionados antes de mapear consumidores e aprovar a
  retenção alternativa.

## Mitigação transitória do Render Free

Enquanto a API estiver no plano Free, `Monitorar saúde do Render` chama o
endpoint público `/health` a cada cinco minutos, fora do minuto cheio. Isso
reduz cold starts, mas não é garantia de disponibilidade: agendamentos do
GitHub podem atrasar e a instância Free pode reiniciar. O workflow tem execução
manual, timeout e retentativas; uma falha fica visível no histórico de Actions.

Remover esse workflow ao migrar a API para Railway ou para uma instância sempre
ativa. O monitor é provisório e não substitui monitor externo, alertas, RPO/RTO
ou política de recuperação.
