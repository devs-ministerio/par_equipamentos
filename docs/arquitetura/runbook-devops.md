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

As actions JavaScript devem usar runtime suportado pelo GitHub-hosted runner.
Em 23/09/2026, `actions/upload-artifact` foi fixada no SHA de `v6.0.0`, que
executa em Node 24; não reduza esse pin a uma tag móvel nem retorne à v4, que
gerava o aviso de depreciação de Node 20.

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
- Configuração vigente em 23/09/2026: a política `SIGEO — Produção` possui
  condições críticas para taxa de erro acima de 5% por 5 minutos, latência p95
  acima de 2 s por 10 minutos, menos de uma transação por 10 minutos (com
  abertura por perda de sinal) e duas falhas do Ping externo em até 10 minutos.
  O workflow ativo `SIGEO — Notificações de Produção` filtra essa política e
  encaminha os eventos de ciclo de vida ao destino de e-mail operacional. Em
  23/09/2026, uma única notificação de teste aprovada foi enviada pelo canal e
  recebida na caixa operacional. Em futuras alterações do destino ou da
  mensagem, repita e registre o teste; não gere erro ou indisponibilidade reais
  para isso.
- O dashboard `SIGEO — Operação de Produção` acompanha a latência p95 em
  série temporal, a taxa de erro e o bloco `Recursos do processo — CPU e
  memória` da `SIGEO API` na janela selecionada. CPU e memória física são
  métricas de runtime emitidas pelo agente Python; não instalar outro coletor
  apenas para duplicá-las. Use-o como ponto de partida para incidentes:
  confirme o alerta, filtre o período, abra APM/Traces e só então consulte os
  logs do Render. Ele não substitui monitor externo nem centralização de logs.
- Não criar limiar de alerta de CPU ou memória por conveniência. Após pelo
  menos sete dias incluindo um período de carga representativa, registre no
  dashboard a linha de base, o limite do plano do provedor e o limiar proposto;
  só então aprove a condição e documente sua justificativa neste runbook.
- O cliente web cria um `X-Trace-Id` opaco de 32 caracteres hexadecimais por
  operação HTTP e conserva o mesmo valor em uma repetição segura. A API só
  aceita esse formato, devolve-o na resposta e o registra no evento
  `sigeo.http`; isso permite correlacionar uma chamada do navegador com a API
  sem transmitir URL completa, querystring, corpo, cookie ou identidade. Não
  reutilize esse identificador como token, nem o exponha como dado de negócio.
- Após publicar mudança no cliente de transporte, faça um smoke sem dados
  sensíveis: `GET /health` com um valor hexadecimal de 32 caracteres em
  `X-Trace-Id`, confirmando resposta `200`, banco conectado e eco do mesmo
  cabeçalho. Em 23/09/2026, esse teste passou no deploy
  `dep-daq6nbrbc2fs73fg4re0` (`d016c6e`).
- Os logs JSON sanitizados do backend continuam no stdout e são encaminhados
  pelo agente New Relic quando `NEW_RELIC_APPLICATION_LOGGING_ENABLED=true` e
  `NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED=true` estão ativos no
  provedor. O limite é de 1.000 amostras por minuto; não habilite atributos de
  contexto adicionais. O `start-server.sh` usa `uvicorn --no-access-log`: o
  access log padrão carregaria IP e request line bruta (inclusive querystring)
  para o coletor. A única telemetria HTTP encaminhada é o evento
  `sigeo.http`, que contém método, caminho sem querystring, status, duração e
  `trace_id` aleatório — nunca corpo, cabeçalhos, usuário ou token.
- A [política de retenção de observabilidade](politica-retencao-observabilidade.md)
  define os prazos efetivos, minimização, acesso e resposta a eventual envio
  indevido. Em 23/09/2026, a conta New Relic confirmou 30 dias para `Log`, 8
  dias para APM/erros/traces e 395 dias para dados de Synthetic; não use logs
  como arquivo de auditoria e não crie archive/partição de longa duração sem
  exceção formal.
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

## Monitor externo transitório do Render Free

Enquanto a API estiver no plano Free, o monitor Ping do New Relic `SIGEO API —
health externo` consulta `https://sieo-backend.onrender.com/health` a cada
cinco minutos a partir de São Paulo. Diferentemente do agendamento do GitHub,
ele é executado pela plataforma de observabilidade, registra a disponibilidade
externa, valida TLS e mantém tráfego periódico para reduzir cold starts.

O monitor começou com uma localização para conter consumo do plano. Uma única
região não elimina falso positivo regional: ampliar para ao menos três
localizações depende de revisar a franquia/custo. Remova o monitor ao migrar a
API para Railway ou uma instância sempre ativa; ele continua provisório e não
substitui alertas, RPO/RTO ou política de recuperação.
