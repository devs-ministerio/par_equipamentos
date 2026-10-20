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

O ensaio **não define RPO/RTO de produção**. Um snapshot anterior pode deixar
de fora aprovações, pagamentos capturados e trabalho manual posteriores.
Antes de qualquer corte real, identificar a janela e os registros afetados,
obter aceite do responsável e decidir reconciliação sem apagar a história.
Não fazer replay automático de decisões humanas ou sobrescrever sua origem.

Retenção, acesso e descarte do backup e da origem preservada precisam de
política aprovada conforme a sensibilidade dos dados. Restore no provedor,
credenciais/secret manager, troca de conexão, proxy, comunicação à equipe e
monitoramento pós-corte continuam condicionados à autorização de publicação.
Nenhuma dessas operações foi executada em produção neste ensaio.
