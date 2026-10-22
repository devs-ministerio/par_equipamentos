# Recuperação por snapshot — ensaio local de 18/10/2026

## Escopo e limite do aceite

Estratégia ligada ao [plan-mode de espelho/notificações aprovado](planmode-espelho-notificacoes-2026-10-06.md). O ensaio usa
somente bancos `sigeo_test_migrations_<UUID>` recém-criados, identidades
sintéticas e roles exclusivas. Não é um comando de recuperação de produção.
Não executar os helpers contra um clone preservado ou serviço em uso.

Atualização de 19/10: o defeito RB-001 foi corrigido no código local sob
exceção expressamente autorizada pelo usuário para os downgrades históricos.
A criação duplicada de `alert_type`, a reconstrução da FK/NOT NULL e os
bloqueios seguintes de UNIQUE sem nome/enums órfãos receberam regressão sem
xfail. Os upgrades permanecem inalterados; nenhum banco existente foi migrado.
O ensaio estrutural em banco vazio não devolve dados removidos por downgrade:
este runbook continua usando snapshot em **outro banco**, conferindo
integridade e reaplicando a política de runtime, sem sobrescrever a origem.

Evidência atual: seis testes de migrations, incluindo duas passagens pela
revisão RB-001, reversão até base/reaplicação a partir da revisão histórica e
do head, e preservação de enums externos. Suíte completa em PostgreSQL 18.6
descartável: **1.465 aprovados, zero falhas e zero xfail** em 125,72 s.
Detalhes e autorização em `planmode-espelho-notificacoes-2026-10-06.md`,
seção “Correção autorizada dos downgrades históricos — 19/10”. Isso não
substitui aceite de recuperação no provedor nem altera os requisitos abaixo.

## Sequência de recuperação

1. Interromper novas escritas e jobs; retirar a aplicação antiga do tráfego e
   encerrar seus pools. Preservar a origem para conferência, não apagá-la.
2. Confirmar backup, horário de corte e manifesto de integridade. No ensaio,
   `pg_dump` produz arquivo custom privado 0600 com SHA-256. O arquivo não
   contém roles globais ou suas senhas; owner/ACL não são transportados.
3. Restaurar com `pg_restore --exit-on-error --single-transaction` em outro
   banco privado, vazio e sem acesso do runtime. Não usar `--clean` no banco
   ativo, `stamp`, exclusão manual de enum ou terminação de sessões alheias.
4. Conferir SHA-256 do arquivo, revisão, schema, enums, constraints, triggers,
   sequências e hashes/contagens dos dados. Divergência bloqueia o corte.
5. Antes de conceder acesso, invalidar as sessões e links de convite/
   recuperação restaurados, em uma transação auditada. Preservar senhas,
   status, papéis, IDs, vínculos, valores e histórico existente. Falha ao
   registrar a auditoria reverte também a invalidação dos acessos.
6. Gerar **nova chave JWT do ambiente** antes de iniciar a aplicação destino.
   Um ID de sessão criado depois do backup pode ser reutilizado pela sequence
   restaurada: só revogar as linhas que estavam no snapshot não protege contra
   todos os access cookies posteriores ao backup. Não reutilizar a chave
   antiga nem manter instâncias antigas atendendo com ela.
7. Reaplicar a política declarada de permissões com runtime próprio, sem
   privilégios administrativos: CONNECT, USAGE e DML necessários, sem DDL,
   TEMP, escrita na revisão nem alteração/exclusão da auditoria. No ensaio,
   a role original não recebe CONNECT ao banco destino.
8. Iniciar a aplicação com nova conexão/pool e nova chave JWT, exigir login
   novamente e conferir health, sessão, consulta de instrumento e rejeição
   dos cookies antigos. Só liberar tráfego após as verificações.

## Prova executável

- `backend/tests/test_restore_operacional_db.py`: dump/restore reais,
  runtime TCP restrito e requisições ASGI reais à aplicação, sem mock de
  autenticação ou regra de negócio. A troca da dependência de conexão é a
  fronteira de infraestrutura do ensaio; **não certifica proxy, socket,
  orquestrador ou deploy de produção**.
- `backend/tests/restore_operacional_fixture.py`: login antes e depois do
  snapshot, com cookies sintéticos separados. Um registro posterior fica na
  origem e não no destino; o teste torna visível a janela de recuperação.
- `backend/scripts/corte_restore_sintetico.py`: sem CLI; exige banco sintético
  privado, revisão conferida, manifesto idêntico e nenhum outro cliente.
  Não muda senhas ou situação dos usuários. Recusa transação pendente e nova
  execução com o manifesto anterior; não duplica a auditoria por retry.
- `backend/tests/test_rollback_snapshot_recuperacao_db.py`: complementa a prova
  com quatro revisões, dados, enums, triggers append-only e sequences.

Executar com o launcher de homologação e PostgreSQL local de testes explícito;
nunca herdar `.env` de produção. As guardas recusam destinos fora dos bancos
sintéticos. Os testes apagam somente seus próprios bancos e roles de UUID.

## RPO, RTO e aprovação de produção

Aceite do usuário em **21/10/2026**: **RTO de 1 hora** para voltar a
disponibilizar o sistema após uma falha. É um objetivo aprovado, não um prazo
já comprovado no provedor. Em confirmação separada de **21/10/2026**, o
usuário aprovou perda máxima de trabalho (**RPO**) de **até 24 horas**.
Esses limites não comprovam a cobertura atual de backups nem autorizam
alterar retenção, contratar serviço ou executar corte/restauração em produção.

O ensaio local **não certifica o RTO de produção**. A validação operacional
deverá medir detecção, restauração, troca segura de conexão e retorno validado
do serviço no provedor, com os responsáveis envolvidos. Um snapshot anterior
pode deixar de fora aprovações, pagamentos capturados e trabalho manual posteriores.
Antes de qualquer corte real, identificar a janela e os registros afetados,
obter aceite do responsável e decidir reconciliação sem apagar a história.
Não fazer replay automático de decisões humanas ou sobrescrever sua origem.

Retenção, acesso e descarte do backup e da origem preservada precisam de
política aprovada conforme a sensibilidade dos dados. Restore no provedor,
credenciais/secret manager, troca de conexão, proxy, comunicação à equipe e
monitoramento pós-corte continuam condicionados à autorização de publicação.
Nenhuma dessas operações foi executada em produção neste ensaio.

## Conferência somente leitura do provedor — 21/10/2026

- Projeto Neon `par_equipamentos`, branch `production`: o resumo do projeto
  e a tela Billing confirmam **Build**. Não foi contratado outro plano.
- Backup & Restore informa **6 horas de histórico**, **nenhum snapshot** e
  **nenhum agendamento**. A tela Postgres/History window oferece somente
  0/1/2/6 horas e direciona janelas maiores para upgrade. Não se alterou o
  slider nem se acionaram Create, Restore, Preview data ou mudança de plano.
- Não confundir retenção com RPO: 6 horas é a idade máxima dos pontos
  disponíveis para voltar no tempo, não a quantidade de trabalho perdida.
  Essa janela pode ajudar em erro recente, mas não comprova recuperação de
  corrupção ou exclusão percebida depois de 6 horas. RPO de 24 horas e RTO
  de 1 hora permanecem objetivos, não garantias certificadas por essa tela.
- Não foi encontrado workflow de backup no checkout. Isso não comprova
  inexistência de cópia institucional fora do projeto. Dumps locais de
  ensaios não substituem backup recorrente de produção.
- Evidências privadas: `neon-recuperacao-atual.png` e
  `neon-limite-historico.png` em
  `/private/tmp/sigeo-fechamento-homologacao-o5mGyC/`. A tela de faturamento
  foi apenas consultada; seus dados pessoais/financeiros não foram copiados
  para o repositório ou para as capturas de evidência.

### Decisão necessária antes de configurar backup

**Atualização de 21/10 — decisão tomada e provisionamento parcial.** O usuário
escolheu R2 e autorizou bucket privado, criptografia, periodicidade proposta
de 12 horas/retenção de 7 dias e acesso restrito Neon/GitHub. A lista abaixo
registra o caminho original; não representa ausência dessas autorizações.

- Bucket `sigeo-backups-producao`, Standard, acesso público desabilitado.
  Credencial R2 Object Read & Write limitada exclusivamente a esse bucket;
  não há permissão administrativa ou exposição pública.
- Ensaio real exclusivamente sintético: PostgreSQL 18.6 → pg_dump custom →
  age → upload/download R2 → SHA-256 → age decrypt → pg_restore em outro
  banco UUID local. Três registros conferidos; adulteração recusada.
  GET sem assinatura foi recusado com HTTP 400/InvalidArgument, não 403;
  o painel também confirma Public Access Disabled. Não interpretar esse
  teste como verificação de toda política IAM ou recuperação de produção.
- Role `sigeo_backup` criada por SQL, sem neon_superuser, SUPERUSER,
  CREATEROLE, CREATEDB, REPLICATION ou BYPASSRLS. SELECT em tabelas/sequências
  públicas e default privileges do owner de migrations para objetos futuros;
  sem DML nas tabelas ou CREATE persistente. Limite de duas conexões,
  read-only por padrão, lock timeout de 5 s e statement timeout de 5 min.
  TEMP continua herdado de PUBLIC, preexistente: não se revogou PUBLIC nem
  se mudou a política de acesso dos usuários existentes. Nenhuma função
  SECURITY DEFINER pública executável foi encontrada. TLS verify-full validado.
- Sete Secrets exclusivos `BACKUP_*` instalados e conferidos por nome no
  environment GitHub `Production`. A conexão administrativa pontual não foi
  enviada ao GitHub; sua cópia local temporária foi removida após uso. Chave
  privada age permanece fora do GitHub em arquivo privado local ignorado.
- Credenciais desta etapa expiram em **20/11/2026**: rotação deve preceder
  essa data. Falta segunda cópia segura da identidade age fora do Mac.
- **Ainda não há backup real de produção no R2, workflow/cron ativo, regra
  de expiração ou monitor de atraso configurado.** O ensaio não certifica
  RPO de 24 h nem RTO de 1 h. Não se alterou plano Neon, conexão da API,
  schema ou dados da aplicação. Criar o acesso de backup é uma alteração
  autorizada de permissões em produção, não deploy da aplicação.
- Evidência privada: `/private/tmp/sigeo-r2-validacao-cQkdQw/resultado.json`.
  Credenciais e identidade ficam em arquivos 0600 dentro do diretório privado
  `.codex-work/runtime-backup-r2-20261021/`; nunca copiar valores para Git/logs.

1. Manter Build e a recuperação recente do Neon, adicionando cópia externa
   criptografada em destino institucional aprovado; ou avaliar mudança de
   plano para ampliar a retenção nativa. Não executar upgrade automaticamente.
2. Se escolhido backup externo: aprovar destino, responsáveis, permissões,
   criptografia e retenção antes de transmitir qualquer dump. Proposta para
   aceite: captura a cada 12 horas, retenção inicial de 7 dias, alerta em
   falha e ao exceder 24 horas sem backup íntegro. São parâmetros propostos,
   não agendamento/retention já autorizados ou implementados.
3. Validar primeiro o fluxo com dados sintéticos e falhas de rede/espaço,
   autenticidade/integridade do dump e restore em banco isolado. Um dump ou
   um agendamento bem-sucedido, isoladamente, não certifica RPO/RTO.
4. Somente com aprovação específica, instalar segredos de acesso mínimo,
   habilitar a execução remota e medir restauração no provedor em destino
   separado. Nenhuma troca da conexão ativa ou interrupção da produção faz
   parte dessa autorização preliminar.
