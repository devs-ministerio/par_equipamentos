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

- Encaminhe logs JSON do Render para um destino com retenção; alerte health,
  erro, latência e recurso com severidade e responsável definidos.
- Registre RPO/RTO, retenção/PITR Neon e um teste periódico de restauração.
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
