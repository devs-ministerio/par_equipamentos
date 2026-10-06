# Homologação local protegida — plano aprovado de clonagem

- Objetivo: testar a aplicação com a estrutura e o universo real de produção,
  sem escrever no banco de origem nem disparar comunicação externa.
- Origem: credencial existente, mantida fora do código; conexão forçada
  read-only e snapshot consistente compartilhado com pg_dump.
- Destino: PostgreSQL em loopback; criar bancos novos, nunca sobrescrever os
  demos existentes. Falhar se destino remoto, nome inesperado ou banco existente.
- Dump/restore: stream direto, sem arquivo intermediário contendo dados brutos.
  Não copiar proprietários/permissões nem segredos para o repositório.
- Preservar IDs, relações, instrumentos, CNES, datas e valores públicos;
  conferir contagens por tabela e somas financeiras contra o mesmo snapshot.
- Proteger usuários, senhas, sessões, tokens, contatos e texto interno;
  pseudonimizar pessoas identificadas, mascarar e-mail/CPF/telefone nos payloads.
  Trata-se de cópia protegida/pseudonimizada, não promessa de anonimização irreversível.
- Criar contas sintéticas por papel com senha local aleatória e JWT exclusivo;
  gravar configurações privadas fora do checkout, com permissão 0600.
- Aplicar migrations da homologação exclusivamente na cópia local, após conferir
  o espelho da origem. Validar schema/constraints e auditar vínculos.
- Manter base sem conexões, cópia de trabalho para o app e cópia descartável
  para pytest/E2E; cada restauração preserva a base aprovada.
- Implementação: scripts/clonar_banco_local.py, scripts/proteger_clone_local.py,
  testes unitários de proteção/guardas e testes DB na cópia descartável.
- Documentar alterações intencionais de dados privados, revisão da origem,
  revisão local, contagens, falhas de auditoria e comandos de retomada.
- Não há mudança de regra de negócio, cálculo ou configuração de produção.

## Extensão solicitada — sistema completo de homologação

- Aplicação local + fluxos de APIs oficiais que gravam apenas no destino local.
- Runner deve exigir destino loopback, env local explícito, impedir fallback
  para DATABASE_URL/DATABASE_URL_MIGRATION de produção e serializar rodadas.
- Duas modalidades: recaptura real para conferir contratos/frescor, simulação
  determinística para timeout, parcialidade, repetição e mudança de campos.
- Coletas reais devem reaplicar a política de proteção antes de expor dados
  novos na homologação. Não habilitar automaticamente durante a clonagem.
- Convites/redefinição via caixa HTTP local protegida, nunca gateway real;
  validar link, uso único, cadastro de senha, primeiro login e renovação.
- Notificações internas reais no clone, com usuários sintéticos e histórico.
- Nenhum workflow/deploy/schedule remoto é ativado. DevOps e integrações reais
  externas continuam exigindo verificação separada; clone não garante 100%.
- Próxima entrega após clonagem: runner local, caixa de e-mail e matriz E2E.

## Execução e limpeza — 06/10/2026

- Clone concluído em snapshot read-only: 29 tabelas, 560 convênios,
  248 instrumentos, 635.113 CNES, 28 propostas e 22 usuários de origem.
- Contagens e somas financeiras conferidas antes/depois da proteção;
  quatro contas sintéticas adicionadas intencionalmente após a conferência.
- Revisão de origem `a3f1c9e7b204`; cópias locais em `b5c6d7e8f9a0`.
  Zero e-mails externos, tokens de ativação ou constraints não validadas.
- A credencial de migração não lia três tabelas: nenhuma permissão alterada.
  Utilizada a credencial existente de runtime, forçada a read-only, com
  verificação de SELECT em todas as tabelas/sequências antes da cópia.
- Base protegida sem conexões, clone de trabalho e clone descartável de
  teste criados; demo permanece ligado ao servidor até a troca validada.
- Cinco bases antigas sem conexões arquivadas/removidas: constitution_test,
  e2e_local, homologacao_local, test e test_integracao_master_20261006
  (todas com prefixo `sigeo_`). Não foram encerradas conexões alheias.
- Dumps privados em `/private/tmp/sigeo-bancos-arquivados-20261006`, pasta
  0700/arquivos 0600, manifesto SHA-256; restauração integral de cada dump
  validada em banco temporário e esses temporários removidos.
- Backups em diretório temporário não substituem arquivo durável: preservar
  fora de /tmp antes de limpeza do sistema. Não há exclusão automática.
- Scripts passaram ruff/mypy; sete testes de guardas/proteção passaram.
- Ainda pendentes: troca do servidor, suíte completa no clone, runner de
  APIs, caixa de e-mail local e matriz E2E. Clonagem não encerra esse plano.

## Segunda etapa — aplicação e fluxos locais

- Backend `127.0.0.1:8001` conectado ao clone de trabalho; frontend em
  `127.0.0.1:5181`. Runtime sem SUPERUSER/CREATEDB/CREATEROLE nem CREATE no
  schema; migrations e testes usam credencial administrativa separada local.
- `scripts/homologacao_local.py --env <arquivo privado> app|email|testes|apis-simuladas`
  valida ambas as URLs, nomes dos clones, segredo e destinos loopback;
  bloqueia parâmetros de conexão capazes de redirecionar host/service.
- Configuração local explícita antecede import de Settings; subprocessos
  recebem defaults explícitos, nunca fallback para configuração de produção.
- Caixa HTTP em `127.0.0.1:8002`: chave privada, destinatários `@example.com`,
  schema de entrada/saída, limite de 128 KB e 200 mensagens, no-store.
  Memória é efêmera: reinício limpa mensagens; não é gateway de produção.
- HTTP real validado por `scripts/validar_homologacao_http.py`: convite,
  captura, senha, primeiro login, refresh rotativo, redefinição, uso único,
  logout e negação de administração ao leitor. Senhas/tokens não impressos.
- Chromium validou login e renderização de Dados Oficiais, Mesa de trabalho
  e Painel com a base real protegida (`homologacao-local.spec.ts`).
- Simulações das APIs: 42 testes passaram; dump vazio, parcialidade,
  mudanças de campos/filhas, preservação, rollback e avisos agrupados.
  Trava serializa suítes/rodadas no banco descartável. Não é captura real.
- Testes corrigidos para base populada: múltiplos instrumentos por CNES,
  filtros por situação/tipo, auditoria por par entidade+ID e ausência de
  cobertura construída temporariamente com rollback. Regra do app intacta.
- Validação final: 515 testes backend, 220 frontend e smoke Chromium passaram;
  ruff/mypy app e scripts alterados, lint/typecheck/build frontend passaram.
  Gate CI remoto não executado: nenhum push nesta entrega.
- Próximo bloco: staging isolado para coletas reais, proteção pós-coleta,
  publicação somente após auditoria e testes do aceite de convênio no Radar.
- Sem push, workflow, deploy ou alteração de produção nesta etapa.
