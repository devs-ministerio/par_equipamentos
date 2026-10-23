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

Os workflows usam `ubuntu-24.04`, não `ubuntu-latest`, para evitar mudança
automática de imagem do runner sem validação prévia. Reavalie a próxima versão
LTS como alteração de infraestrutura: execute `actionlint`, CI e supply chain
antes de promovê-la.

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
- Falha de pipeline grava no `AuditLog` somente `pipeline` e `error_type`.
  Não armazene mensagem, traceback, URL ou resposta externa nesse registro de
  longa retenção; o processo continua relançando o erro para o executor
  autorizado (terminal ou job de CI), que preserva seu exit code.
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

## Ensaio de migração de servidor (pg_dump/pg_restore)

Diferente do exercício de restauração PITR acima (que valida recuperação
*dentro* do Neon, restaurando uma branch a partir de um ponto no tempo),
este runbook cobre a migração de servidor decidida em
`diagnostico-constituicao-database-2026-09-16.md` ("Estratégia de
ingestão e clonagem"): mover o banco inteiro para outro
servidor/ambiente via `pg_dump`/`pg_restore`, nunca reingestão. Nunca foi
ensaiado ponta a ponta — só a criação de schema vazio foi testada antes
disso (achado da auditoria de 2026-09-25). Exige `DATABASE_URL_MIGRATION`
real (role `sigeo_migration`), que este ambiente de execução não tem —
rodar manualmente, nunca a partir de uma sessão sem esse acesso.

1. **Preparar o destino descartável**: suba um Postgres novo e vazio (ex.
   `docker run --rm -e POSTGRES_PASSWORD=... -p 5433:5432 postgres:16-alpine`,
   ou uma branch Neon nova só para este ensaio — nunca `production`).
2. **Dump do Neon atual**:
   ```bash
   pg_dump "$DATABASE_URL_MIGRATION" --format=custom --no-owner --no-privileges \
     --file=sigeo-dump-$(date +%Y%m%d).dump
   ```
   `--no-owner`/`--no-privileges` evita que o restore falhe tentando recriar
   os roles `sigeo_runtime`/`sigeo_migration` no destino (que ainda não
   existem lá) — os roles do destino são recriados à parte, não pelo dump.
3. **Restore no destino**:
   ```bash
   pg_restore --dbname="postgresql://postgres:...@localhost:5433/postgres" \
     --no-owner --no-privileges --create sigeo-dump-YYYYMMDD.dump
   ```
4. **Validar schema**: `uv run alembic current` apontando pro destino deve
   devolver o mesmo head que a produção (`alembic heads` sem
   `DATABASE_URL_MIGRATION` setado pro destino ainda não existe — depois do
   restore, os dois devem bater). Rode também
   `uv run pytest tests/test_schema_migrations.py` contra o destino.
5. **Smoke test da API**: suba a API local apontando `DATABASE_URL` pro
   destino (role de leitura/escrita equivalente ao `sigeo_runtime`,
   recriado manualmente no destino) e confirme `GET /health` com banco
   conectado, e pelo menos 1 leitura autenticada real (`GET /auth/me` após
   login com um usuário existente no dump).
6. **Descartar o destino** ao final — é um ensaio, não uma migração real;
   documentar aqui a duração de cada etapa (dump/restore/validação) para
   estimar RTO de uma migração de servidor real, separado do RTO de 4h já
   aprovado para restauração PITR dentro do Neon.

Sem exercício registrado ainda — próxima pessoa com acesso a
`DATABASE_URL_MIGRATION` deve rodar isso e anexar o resultado aqui (data,
duração de cada etapa, revisão Alembic conferida, qualquer divergência).

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

## Backup cifrado diário no R2 (Plan Mode execução 2026-10-22)

Meta aprovada: **RPO ≤ 24 h** e **RTO ≤ 1 h**. O histórico nativo do Neon Build
(6 h, sem snapshot) cobre só erro recente; este fluxo é a cópia independente.

**Componentes**

- `.github/workflows/backup_banco.yml` (environment `Production`, só branch
  `master`): `pg_dump -Fc` com a role somente leitura `sigeo_backup`, valida a
  estrutura com `pg_restore --list`, cifra com `age` (só a chave pública está
  no GitHub), envia dump e SHA-256 ao bucket privado `sigeo-backups-producao`,
  confere o tamanho remoto, aplica a retenção e falha se não houver backup
  íntegro nas últimas 24 h. Agendado às 02:17 e 14:17 UTC (a cada 12 h) desde
  22/10/2026, além do disparo manual.
- `backend/scripts/backup_retencao.py` (testado em `tests/test_backup_retencao.py`):
  nomeia o objeto, calcula expiração (7 dias) e atraso (24 h). Só considera
  objetos com o padrão `sigeo/producao/AAAA/MM/DD/sigeo-<UTC>-<run>.dump.age[.sha256]`,
  só conta como íntegro o dump não vazio com `.sha256`, e **nunca expira os 3
  backups íntegros mais recentes**, mesmo velhos.
- `backend/scripts/restaurar_backup.sh`: ensaio local de restauração, mede o RTO.

**Secrets (environment Production, só nomes):** `BACKUP_DATABASE_URL`,
`BACKUP_AGE_RECIPIENT`, `BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET`,
`BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`,
`BACKUP_CREDENTIAL_EXPIRES_ON` (AAAA-MM-DD; o workflow avisa a 10 dias do
vencimento e recusa rodar depois dele). A credencial atual expira em
**20/11/2026**; rotacionar antes e atualizar a data.

**Impacto no sistema:** o backup **não derruba nem pausa a aplicação**. O
`pg_dump` lê um retrato consistente do banco e não bloqueia leituras nem
gravações; o que for gravado depois de o dump começar entra só no próximo
backup (essa é a janela do RPO). O workflow usa o mesmo grupo de `concurrency`
do `migrar_banco.yml` para nunca rodar junto de uma migration. Uma
**restauração real após desastre** é outro assunto e exige janela de
manutenção; o ensaio do `restaurar_backup.sh` é só local.

**Primeira execução (manual, com autorização)**

1. Após o merge na `master`, disparar `Backup cifrado do banco` em Actions.
2. Conferir no resumo da execução: objeto, tamanho cifrado e duração.
3. Rodar o ensaio de restauração em PostgreSQL local:
   ```bash
   backend/scripts/restaurar_backup.sh --env ARQUIVO_PRIVADO.env --identidade ARQUIVO_AGE_PRIVADO
   ```
   O `.env` e a identidade `age` precisam ter permissão 0600 e ficar fora do Git.
   O script confere o SHA-256, decifra, restaura num banco novo `sigeo_restore_*`
   em loopback, imprime o tempo e a contagem de linhas por tabela e remove o banco.
4. Registrar o tempo medido e as contagens (comparar com o banco de origem) como
   evidência do RTO. **RPO/RTO só são declarados atendidos depois disso.**

**Agendamento (ativo desde 22/10/2026):** o workflow roda às 02:17 e 14:17 UTC
(a cada 12 h), ativado só depois de o backup real ser restaurado com duas
identidades distintas. Para suspender, remover o bloco `schedule:`. Falha do
job notifica por e-mail do GitHub; a verificação final do job transforma "sem
backup íntegro em 24 h" em falha. O RPO de 24 h só é dado como atendido depois
de ao menos um ciclo agendado completo com sucesso.

**Ensaio de restauração em destino Neon (22/10/2026)**

Projeto descartável `sigeo-ensaio-restauracao-20261022` (PostgreSQL 18, Ohio, 0,25–2 CU),
conexão **direta** (sem `-pooler`: o pooler quebra o `pg_restore`). Comando medido:

```bash
age -d -i IDENTIDADE -o dump dump.age && \
  pg_restore --no-owner --no-privileges --exit-on-error -j 4 -d "$NEON_URL" dump
```

- **Resultado:** 848 s (14 min 8 s) para decifrar e restaurar; `convenio` = 560,
  `user` = 22, `alembic_version` = `a3f1c9e7b204`, idêntico ao backup. O download
  do R2 não entrou nessa medida (poucos minutos no máximo nos ensaios).
- **Lentidão:** vem do compute pequeno construindo índices de tabelas grandes
  (`cnes_estabelecimento`, 635 mil linhas). Num desastre real, subir o mínimo do
  compute (por exemplo 2 CU) antes de restaurar deve reduzir o tempo; não medido.
- **Credencial do destino:** a string de conexão contém senha. Colar num `read -s`
  do terminal, nunca em arquivo, chat ou histórico; o `pbpaste` lê o clipboard,
  que é sobrescrito por qualquer comando copiado, então colar direto no prompt.
- **Limpeza:** o projeto de ensaio contém cópia dos dados reais e deve ser
  apagado pelo responsável assim que a medição terminar.

**O que ainda falta para certificar o RTO de 1 h**

1. **Recriar as roles após a restauração.** O `--no-owner --no-privileges` deixa as
   tabelas sem dono e sem permissões: `sigeo_runtime` (só DML), `sigeo_migration`
   (dona do schema, DDL) e `sigeo_backup` (somente leitura) precisam ser criadas e
   receber `GRANT`/dono. **Não há script versionado que reproduza isso**
   (gap P2 de `diagnostico-constituicao-database-2026-09-29.md`); sem ele a API não
   conecta com a credencial de produção. É o principal item restante.
2. Trocar `DATABASE_URL` (e `DATABASE_URL_MIGRATION`) no Render e esperar o redeploy;
   tempo a medir no histórico de deploys do Render, sem tocar na produção.
3. Teste funcional: subir a API contra o destino restaurado e conferir login e uma
   leitura autenticada.

Orçamento provisório: restauração de dados ~15 a 18 min (download + decifra +
restauração) deixa ~40 min para detecção, roles, troca de URL e redeploy. Esse
orçamento só vale depois dos itens 1 a 3.

**Riscos e pendências**

- **Identidade `age` 1 retirada de uso (22/10).** A identidade criada no ensaio
  do R2 foi exposta acidentalmente durante a configuração e deve ser tratada
  como comprometida. Nenhum backup real foi cifrado para ela; a chave pública
  dela **não deve ser cadastrada** em `BACKUP_AGE_RECIPIENT`. A identidade 3 foi
  perdida antes de ser guardada (apagada cedo demais; nenhum backup foi cifrado
  para ela) e substituída pela identidade 4. Destinatários vigentes: identidade
  2 (Bitwarden) e identidade 4 (Bitwarden e cópia cifrada com senha em OneDrive).
- **Duas identidades `age` independentes.** `BACKUP_AGE_RECIPIENT` aceita uma
  chave pública por linha e cada backup é cifrado para todas; qualquer
  identidade privada restaura. Nenhuma chave privada é copiada: a segunda é
  gerada (`age-keygen`) por outra pessoa responsável e só a linha `age1...`
  vem para o GitHub. Guardas: Bitwarden e cópia offline em armário trancado;
  nunca GitHub, R2, Neon, Render, e-mail ou chat. **Risco aceito
  temporariamente (22/10):** hoje o cofre tem um único titular. Mover o item
  para uma coleção de organização com ao menos uma segunda pessoa (ou ativar o
  acesso de emergência do Bitwarden) é pendência. Ao restaurar, buscar o item do
  Bitwarden **pelo id** (`bw list items --search age`; depois `bw get notes ID`),
  nunca pelo nome: a busca por nome do `bw` é aproximada e pode devolver mais de
  um item, e apagar por engano um deles descartaria uma das identidades; até lá, perder o acesso ao
  cofre e ao Mac simultaneamente torna os backups irrecuperáveis. O RTO só vale após restaurar com a **segunda**
  identidade retirada do seu local de guarda. Sem pelo menos uma identidade
  acessível, nenhum backup é restaurável.
- A chave de decifragem nunca vai ao GitHub, ao R2 ou aos logs.
- O workflow não cobre indisponibilidade do próprio GitHub Actions; o monitor de
  atraso é a falha visível do job seguinte. Se desejar alerta independente,
  avaliar monitor externo (New Relic) sobre a data do último objeto.
- Custo: R2 e Actions dentro das franquias gratuitas na escala atual
  (~226 MB de banco, 2 execuções/dia); reavaliar se o volume crescer.

## Recriar as roles da aplicação após restaurar um backup (Plan Mode execução 2026-10-22)

O backup é restaurado com `pg_restore --no-owner --no-privileges`, então o banco
chega sem dono e sem permissões. Antes de apontar a aplicação para ele é preciso
recriar `sigeo_migration` (dona do schema, único com DDL), `sigeo_runtime` (só DML)
e `sigeo_backup` (somente leitura, 2 conexões, timeouts curtos). Isso agora está
versionado em `backend/scripts/sql/recriar_roles_aplicacao.sql`, executado por
`backend/scripts/recriar_roles_banco.sh`, que também **verifica** o resultado.

```bash
export ADMIN_DATABASE_URL='postgresql://ADMIN:SENHA@HOST/BANCO?sslmode=require'
export SIGEO_RUNTIME_PASSWORD=... SIGEO_MIGRATION_PASSWORD=... SIGEO_BACKUP_PASSWORD=...
backend/scripts/recriar_roles_banco.sh --confirmo-host HOST
```

- `ADMIN_DATABASE_URL` é a role administrativa do destino (no Neon, `neondb_owner`),
  conectada ao banco restaurado, **com conexão direta (sem `-pooler`)**.
- As três senhas são novas (>= 24 caracteres, distintas), geradas na hora, por
  exemplo com `openssl rand -hex 16`, e nunca aparecem no script nem na linha de
  comando. Depois, registrar nos secrets e no Render: `DATABASE_URL` (runtime),
  `DATABASE_URL_MIGRATION` (migration) e `BACKUP_DATABASE_URL` (backup).
- **Nunca rodar contra a produção viva:** o script redefine senhas e donos. Por isso
  exige `--confirmo-host HOST` igual ao host da URL. Idempotente, PostgreSQL 16+.
- A verificação conecta como cada role e confere: roles sem privilégios elevados;
  tabelas e tipos enum do `public` pertencentes a `sigeo_migration`; `sigeo_runtime`
  lê e tem DML mas **não cria tabela**; `sigeo_migration` altera o schema;
  `sigeo_backup` só lê, com transação somente leitura por padrão.
- **Ensaiado em 22/10/2026** em PostgreSQL 18 local, com uma role administrativa sem
  superusuário (mesma limitação da `neondb_owner`), sobre um banco restaurado sem
  dono: todas as verificações passaram; segunda execução idempotente; `pg_dump`
  como `sigeo_backup` gerou o dump; `alembic downgrade -1` e `upgrade head` como
  `sigeo_migration` rodaram; `ALTER TYPE ... ADD VALUE` funcionou (o tipo é da role
  de migração); tabela criada depois já nasce com as permissões; a API leu dados
  como `sigeo_runtime` e teve `CREATE TABLE` negado.
- **A confirmar:** o desenho vem do Plan Mode database 2026-09-16. O privilégio de
  `sigeo_runtime` em sequências foi assumido como `USAGE, SELECT` (sem `UPDATE`);
  comparar as ACLs reais da produção com as deste script, por consulta somente
  leitura, antes de depender dele num desastre. Este script **não recria**
  extensões (`pg_trgm` vem do próprio dump) nem a role gerenciada `neondb_owner`.

## Pré-voo de posse dos objetos antes de migrar (achado em 22/10/2026)

Uma consulta somente de catálogo em produção mostrou que a posse do schema `public`
está **pela metade**: `sigeo_migration` é dona de 26 das 29 tabelas e de 24 das 27
sequências, mas `neondb_owner` ficou com as tabelas `evidencia_transferegov`,
`instrumento_responsavel` e `notificacao_destinatario`, suas 3 sequências e **os
11 tipos enum** (entre eles `notificacao_tipo`). `sigeo_migration` não é membro de
`neondb_owner`, então não herda nada dele.

**Consequência:** só o dono altera tabela ou tipo. As migrations do release
(`ALTER TYPE notificacao_tipo ADD VALUE` em `95d13a6e4c28`, `c6e7f8091a2b` e
`d7e8f9a0b1c2`; coluna e índice novos em `notificacao_destinatario` em
`e8f9a0b1c2d3`) falham em produção com `must be owner of type notificacao_tipo`.
Reproduzido localmente com a mesma posse (3 tabelas, 3 sequências e 11 enums com a
role administrativa): a primeira migration falha e a revisão fica em `a3f1c9e7b204`.

**Correção (só muda o dono; não altera dados, senhas nem permissões):**
`backend/scripts/sql/normalizar_posse_aplicacao.sql`, executado como a role
administrativa (no Neon, `neondb_owner`) em transação única, **antes** de
`alembic upgrade head`:

```bash
psql "$ADMIN_DATABASE_URL" --no-psqlrc -1 -v ON_ERROR_STOP=1 \
  -f backend/scripts/sql/normalizar_posse_aplicacao.sql
```

- Idempotente. Informa quantos objetos estavam fora de `sigeo_migration` antes e
  depois, e **falha se sobrar algum**. Exige PostgreSQL 16+ e a role
  `sigeo_migration` já criada.
- Concede a `neondb_owner` o direito de atribuir posse (`GRANT sigeo_migration TO
  neondb_owner WITH INHERIT FALSE, SET TRUE`), sem herdar privilégios.
- Ensaiado em PostgreSQL 18 local com a posse idêntica à de produção (3/3/11):
  corrigiu 17 objetos; segunda execução sem efeito; em seguida as 12 migrations do
  release aplicaram como `sigeo_migration` em 0,40 s, sem deriva do schema.
- **Em produção:** alteração de DDL; só depois de um backup íntegro recente e com
  autorização explícita. Faz parte do pré-voo da publicação, antes do workflow
  `migrar_banco.yml`.
- O script de recuperação (`recriar_roles_aplicacao.sql`) reaproveita este mesmo passo.
  A comparação com produção também mostrou que `sigeo_backup` tem
  `idle_in_transaction_session_timeout=1min`, agora incluído no script.

## Trocar a senha de um role do banco (regra após o incidente de 23/10/2026)

A troca da senha do `neondb_owner` derrubou a API porque o Render ainda a usava (ver [incidente](incidente-api-neondb-owner-2026-10-23.md)). Antes de resetar qualquer role:

1. **Inventariar os usos pelo nome do usuário**, não pela documentação: variável `DATABASE_URL` do Render, secrets do repositório e do environment `Production` no GitHub (`DATABASE_URL`, `DATABASE_URL_MIGRATION`, `BACKUP_DATABASE_URL`), variáveis da Vercel, `.env` locais e jobs agendados. Só o usuário que vê os valores consegue conferir o usuário de cada string.
2. **Ter a string nova pronta** para cada ponto de uso e trocá-las na mesma janela, começando pelo Render.
3. **Verificar depois:** `/health` com `database: connected`, um login real, e o próximo backup agendado.
4. Nunca colar a string de conexão em chat, issue ou log; mascarar a senha ao pedir ajuda.

