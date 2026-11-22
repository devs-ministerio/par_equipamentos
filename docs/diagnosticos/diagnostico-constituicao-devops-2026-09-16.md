# Diagnóstico da Constituição DevOps — 2026-09-16

## Escopo e método

Este diagnóstico confronta `padroes/devops/constituicao_devops.md` e os
critérios relacionados das constituições de segurança, database e qualidade
com a infraestrutura versionada do SIGEO. Foram analisados deploy do backend
no Render, frontend na Vercel, Postgres Neon, workflows do GitHub Actions,
segredos declarados, lockfiles, artefatos, health check, migrations,
observabilidade, backup e rollback.

Não foram acessados os painéis das plataformas. Configurações feitas
manualmente em Render, Vercel, Neon ou GitHub que não estejam versionadas são
classificadas como **não comprovadas**, não como inexistentes.

Esta etapa não altera infraestrutura nem executa deploy.

## Resumo executivo

O projeto possui deploy simples e funcionalmente plausível: backend nativo no
Render, frontend na Vercel, banco externo no Neon, lockfiles versionados,
variáveis sensíveis fora do código e dois workflows manuais para rotinas de
dados. O backend também expõe `/health` com consulta real ao banco.

Entretanto, a constituição DevOps ainda não foi aplicada como sistema de
entrega. Não há Dockerfile, `.dockerignore`, docker-compose, CI de aplicação,
scan de dependências/imagem, staging, workflow de deploy, smoke test,
observabilidade, alertas ou rollback documentado e testado.

O maior risco é a combinação de migration e produção: o Render executa
`alembic upgrade head` dentro de todo boot, e os dois workflows de dados também
executam migrations antes de operar sobre o banco apontado por
`secrets.DATABASE_URL`. Um `workflow_dispatch` pode rodar a partir de uma ref
selecionada pelo operador, sem `environment` protegido, aprovação, snapshot ou
validação anterior. Isso permite aplicar schema de uma branch não validada no
banco compartilhado.

Avaliação inicial: **3,5/10 de conformidade DevOps**. A nota reconhece
lockfiles, segredos por ambiente, health endpoint e configurações declarativas
de hospedagem, mas os gates e controles operacionais essenciais ainda não
existem ou não possuem evidência.

## Inventário atual

- Backend: Render, runtime Python nativo, plano free.
- Frontend: Vercel, rewrite SPA para `index.html`.
- Banco: Neon PostgreSQL externo ao Render.
- Entrada alternativa do backend: `backend/Procfile`.
- Automação: dois workflows manuais de dados.
- Agendamento: crons comentados.
- CI de aplicação: inexistente.
- CD versionado: inexistente; o deploy aparenta depender da integração direta
  Render/Vercel com o repositório.
- Containerização: inexistente.
- Observabilidade versionada: inexistente.
- Lockfiles: `backend/uv.lock` e `frontend/package-lock.json` versionados.
- Endpoint de saúde: `/health`, incluindo `SELECT 1` no banco.

## Pontos conformes ou bem encaminhados

- `.env` real é ignorado; `.env.example` contém placeholders.
- `DATABASE_URL` dos workflows vem de GitHub Secrets e não é impresso.
- O scan textual não encontrou credencial real versionada no estado atual nem
  histórico evidente de `.env` rastreado.
- Dependências Python e Node possuem lockfiles.
- `uv sync --frozen` respeita o lockfile nos workflows.
- Render e Vercel possuem configuração declarativa versionada.
- O backend normaliza formatos de `DATABASE_URL` e falha se a variável
  obrigatória não existir.
- `/health` valida processo e conectividade com PostgreSQL.
- Rotinas de dados são idempotentes em vários pontos e registram falha de
  pipeline no domínio.
- Os schedules permanecem desativados enquanto a operação não está pronta,
  evitando falhas diárias artificiais.
- Caches brutos de cerca de 931 MB estão ignorados; não entraram no Git.

## Divergências prioritárias

### P0 — migration e acesso ao banco de produção

1. **Migration acoplada ao boot.** O `startCommand` do Render executa Alembic
   antes do Uvicorn em toda inicialização, inclusive após suspensão do free
   tier. Uma migration lenta ou incompatível impede o serviço de subir.

2. **Migration nos workflows operacionais.** `pipelines.yml` e
   `radar_convenios.yml` executam `alembic upgrade head` antes dos jobs de
   dados. Job operacional e evolução de schema têm ciclos de risco distintos
   e não deveriam estar implicitamente acoplados.

3. **Ref não restringida.** `workflow_dispatch` pode ser iniciado sobre outra
   branch/ref. Como o checkout usa a ref da execução, uma migration ainda não
   aprovada pode alcançar o banco configurado no secret.

4. **Sem GitHub Environment.** O acesso ao banco não usa `environment` com
   proteção, reviewers e secrets próprios de produção.

5. **Sem snapshot/backup comprovado.** Nenhuma etapa confirma backup anterior
   a migration nem existe runbook de restauração.

6. **Sem estratégia expand-contract no deploy.** A documentação do database
   orienta migrations seguras, mas o pipeline não verifica compatibilidade
   entre versão anterior e nova durante rollout.

### P0 — ausência de CI bloqueante

1. Não existe workflow para push/PR com lint, typecheck, testes e build.
2. O frontend está atualmente com build quebrado e nenhum gate automatizado o
   impediria de chegar ao deploy da Vercel.
3. Ruff e mypy não estão instalados no backend; logo também não podem ser
   executados em CI.
4. Testes PostgreSQL dependem de `TEST_DATABASE_URL`, mas o CI não provisiona
   Postgres nem executa migrations/testes DB.
5. Não há cobertura com thresholds por camada.
6. Não há scan de dependência, secret scanning configurado no projeto,
   CodeQL, SBOM ou scan de imagem.

### P1 — containerização e reprodutibilidade

1. Não existe Dockerfile para backend ou frontend.
2. Não existe `.dockerignore`.
3. Não existe docker-compose reproduzindo aplicação e PostgreSQL local.
4. O runtime de produção é montado diretamente pelo Render com
   `pip install uv && uv sync --frozen`; a versão instalada do `uv` não está
   fixada no `render.yaml`.
5. Os workflows usam `astral-sh/setup-uv@v3` com `version: "latest"`, portanto
   o mesmo commit pode usar ferramentas diferentes em execuções futuras.
6. Actions são referenciadas por tags (`@v4`, `@v3`), não por SHA imutável. É
   aceitável como estágio inicial, mas não atende supply chain endurecida.
7. Sem imagem única promovida entre ambientes, não há garantia de que staging
   e produção executariam o mesmo artefato.

### P1 — deploy, rollout e rollback

1. Não há ambiente de staging/homologação declarado.
2. Não há workflow separado de deploy com dependência explícita dos gates.
3. Não há aprovação manual de produção versionada.
4. Estratégia de rollout do Render/Vercel não está documentada nem testada.
5. Não há tag de imagem ou artefato identificado por SHA para rollback.
6. Não existe runbook com versão anterior, comandos, responsáveis, decisão
   sobre migrations e validação após rollback.
7. Não há smoke test após deploy do backend ou frontend.
8. `render.yaml` não declara `healthCheckPath`; a existência de `/health` não
   garante que o orquestrador o use para prontidão.

### P1 — segurança e configuração de ambientes

1. `render.yaml` declara `DATABASE_URL` e `CORS_ORIGINS`, mas não declara
   `JWT_SECRET`. Ele pode estar configurado manualmente no painel; isso não é
   reproduzível nem verificável pelo repositório.
2. Não há separação comprovada de secrets de dev/staging/prod.
3. Não há `permissions` mínimo nos workflows; aplica-se o default da
   organização/repositório.
4. Não há Dependabot/Renovate nem rotina de atualização de CVEs.
5. HTTPS é fornecido presumivelmente pelas plataformas, mas não existe teste
   ou política versionada que impeça URL insegura em produção.
6. Headers de segurança e CSP não estão configurados no `vercel.json` nem no
   backend.
7. Acesso aos painéis, MFA, trilha de deploy e revisão de privilégios não têm
   evidência versionada.

### P1 — robustez dos workflows de dados

1. Ausência de `concurrency` permite duas execuções simultâneas contra o mesmo
   banco, com risco de corrida em importadores, publicação de competência e
   notificações.
2. Ausência de `timeout-minutes` permite runner e conexão presos
   indefinidamente até o limite global do GitHub.
3. Se `DATABASE_URL` não existir, o guard faz todos os passos serem pulados e
   o job termina verde. Isso mascara configuração ausente como sucesso.
4. Os três pipelines/fonte seguintes usam `always()` para continuar após
   falha anterior. A intenção de independência é válida, mas o resumo final
   deveria consolidar falhas por fonte e tornar o estado operacional claro.
5. Não há retry controlado no nível do job, artifact de relatório, retenção ou
   notificação operacional de falha.
6. Não há proteção para impedir execução contra database não autorizado, ao
   contrário do guard de `TEST_DATABASE_URL` usado nos testes.

### P1 — observabilidade

1. Logs do backend não são estruturados em JSON.
2. Não há `trace_id`, propagação, latência por endpoint ou duração de query.
3. Não há coletor ou destino explicitamente configurado; retenção do log da
   plataforma não está documentada.
4. Não existem métricas de erro, p50/p95/p99, throughput, CPU, memória ou
   conexões PostgreSQL.
5. Não há health check externo/uptime monitor.
6. Não há alertas com threshold, severidade e destinatário.
7. Não há dashboard operacional ou indicador separado de negócio.
8. Falhas dos workflows dependem apenas da interface/notificação padrão do
   GitHub, sem canal e escalonamento definidos.

### P1 — backup e recuperação

1. Não há política versionada de retenção do Neon.
2. Não há evidência de PITR/snapshot habilitado no plano atual.
3. Não há restore periódico testado.
4. Não estão definidos RPO e RTO.
5. Não existe cópia/estratégia específica para fontes e uploads necessários à
   reconstrução do estado.
6. Rollback da aplicação não está separado do plano de recuperação do banco.

### P2 — artefatos e custo de entrega

1. Há cerca de 36 artefatos versionados entre `backend/scripts/output`,
   `frontend/public` e `data`.
2. Alguns datasets estão duplicados no backend e frontend: por exemplo,
   `siconv_legado.json`/`siconv.json` (~5,3 MB) e
   `transferegov_relacional.json`/`transferegov.json` (~4,8 MB).
3. O frontend ainda consome `siconv.json` em dois fluxos, portanto ele não é
   morto hoje; a duplicação deve ser removida somente após mover essas leituras
   para API/banco.
4. O maior artefato versionado tem cerca de 14,4 MB. O repositório compactado
   ainda é moderado, mas esses snapshots aumentam checkout, build e deploy.
5. O cache bruto local de 958 MB está corretamente ignorado, porém precisa de
   política de limpeza e cache do CI quando os jobs forem automatizados.

## Sequência recomendada de aplicação

### Bloco 1 — CI mínimo e proteção do banco

- Criar `ci.yml` para backend e frontend em PR/push.
- Provisionar PostgreSQL de teste no job e executar Alembic + testes DB.
- Corrigir gates locais já conhecidos antes de torná-los obrigatórios.
- Remover migration dos workflows de dados; criar fluxo de migration separado
  e protegido.
- Restringir produção a GitHub Environment e branch principal.
- Fazer ausência de secret falhar explicitamente.
- Adicionar `permissions`, `concurrency` e timeouts.

### Bloco 2 — containerização reproduzível

- Criar Dockerfile multi-stage do backend, com Python/uv fixados, usuário
  não-root e health check.
- Avaliar se o frontend precisa imagem própria; manter Vercel é aceitável se o
  build estiver gateado e o artefato for rastreável.
- Criar `.dockerignore` e compose local com PostgreSQL e volume nomeado.
- Validar imagem subindo e respondendo `/health`.

### Bloco 3 — CD e migrations

- Separar `deploy.yml` do CI.
- Publicar/promover artefato ou imagem com tag do commit.
- Executar migration em etapa única anterior ao rollout, com aprovação,
  snapshot e compatibilidade expand-contract.
- Configurar health check, smoke test pós-deploy e rollback para SHA anterior.
- Documentar runbooks de deploy, falha de migration e rollback.

### Bloco 4 — supply chain e segurança

- Adicionar audit de dependências, CodeQL/secret scanning e scan de imagem.
- Fixar versões de ferramentas e, progressivamente, Actions por SHA.
- Declarar configuração obrigatória e separar secrets por ambiente.
- Configurar headers de segurança e validar HTTPS.

### Bloco 5 — observabilidade

- Implementar logs JSON e correlação no backend.
- Medir request, banco, chamadas externas e jobs.
- Criar monitor externo de `/health`, dashboard e alertas calibrados.
- Definir canal, severidade e responsável por cada alerta.

### Bloco 6 — recuperação e dados

- Definir RPO/RTO e retenção.
- Confirmar recurso de backup/PITR do plano Neon utilizado.
- Automatizar backup quando necessário e testar restauração.
- Reduzir snapshots duplicados no Git após remover consumidores estáticos.

## Critérios para considerar DevOps fechado

- PR não passa sem lint, tipo, testes, cobertura, build e scan.
- Imagem/backend é reproduzível, mínima, não-root e usa health check.
- Produção recebe somente artefato validado e identificado por SHA.
- Migration é separada, protegida, compatível e precedida por backup.
- Deploy possui aprovação, smoke test e rollback testado.
- Staging e produção diferem por configuração, não por artefato.
- Secrets têm ambiente, privilégio mínimo e rotação documentada.
- Workflows não concorrem sobre a mesma competência/banco.
- Logs, métricas, tracing, dashboards e alertas têm destino e responsáveis.
- Backup possui retenção, RPO/RTO e restore comprovado.
- Runbooks permitem operar o sistema sem depender da memória do autor.

## Evidências desta etapa

```text
Dockerfile: ausente
.dockerignore: ausente
docker-compose: ausente
workflows de CI/CD: ausentes
workflows operacionais: 2, ambos somente workflow_dispatch
health endpoint: presente
health check do orquestrador: não declarado
lockfiles: presentes e versionados
scan de vulnerabilidade: ausente
smoke test pós-deploy: ausente
rollback testado/documentado: ausente
observabilidade versionada: ausente
backup/restore comprovado: ausente
```
