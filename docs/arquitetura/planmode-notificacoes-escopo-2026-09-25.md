# Plan Mode — escopo por responsável + alerta de vigência nas notificações (2026-09-25)

## Objetivo e decisão de domínio

Hoje `Notificacao` (`backend/app/db/models.py`) é uma caixa compartilhada por toda a equipe: `lida`
é um único boolean na linha, sem distinção de destinatário — qualquer colaborador autenticado vê e
marca como lida a notificação de qualquer instrumento, mesmo um que não acompanha. Pedido do
usuário (2026-09-25), avaliado nesta rodada de revisão do sistema de notificações:

1. Cada colaborador só deve receber notificações dos instrumentos que monitora internamente como
   técnico titular ou suplente.
2. Instrumentos **sem** monitoramento interno (não estão em `instrumento_equipamento`) continuam
   avisando **todos** os colaboradores quando a fonte oficial (SICONV legado / TransfereGov) muda —
   não há a quem escopar, ninguém foi designado ainda.
3. Notificação nova: aviso quando faltam **3 meses para o fim da vigência** de um convênio, pra
   equipe atuar junto do convenente na prorrogação.
4. As notificações já têm 3 origens de fato distintas que hoje colapsam no mesmo `atualizacao_api`
   genérico: SICONV legado (`job_verificacao_siconv.py`), linhas de financiamento / TransfereGov
   novo (`job_verificacao_transferegov.py`) e monitoramento interno (`edicao_manual`, dentro de
   `monitoramento_eventos.py`/`monitoramento_instrumentos.py`).

## Achados da verificação sênior (antes de desenhar)

- **A infraestrutura relacional pro escopo já existe e não é usada pra leitura em lugar nenhum**:
  `InstrumentoResponsavel` (`instrumento_id`, `usuario_id`, `papel` titular/suplente,
  `db/models.py:996-1021`) foi criada nos commits recentes ("feat: vincula responsáveis ao
  monitoramento", "fix: conclui suporte ao papel gestor") e hoje só é sincronizada na ESCRITA
  (`monitoramento_eventos.py` espelha `tecnico_titular`/`tecnico_suplente` texto pra lá a cada
  PATCH). O próprio `authz.py:13-14` já documenta isso como pendência: *"o recorte de visibilidade
  por colaborador será aplicado junto da política de acesso por instrumento, sem depender dos
  campos textuais legados"*. Este plan-mode é esse próximo passo — não é desenho novo do zero.
- **`UserRole.gestor` existe no enum desde a mesma rodada recente, mas tem ZERO comportamento
  diferenciado em qualquer service/router hoje** (`authz.py` só distingue `leitor` vs. resto,
  binário) — confirmado por grep. Este plan-mode é a primeira vez que `gestor` ganha uma regra
  real (visão completa, sem escopo por instrumento).
- **Campo de vigência só existe em `Convenio.data_final_vigencia`** (`models.py:400`), não em
  `InstrumentoEquipamento` — o alerta precisa cruzar por `Convenio.numero` ↔
  `InstrumentoEquipamento.nr_convenio` (mesma convenção de cruzamento documentada no CLAUDE.md pro
  resto do sistema).
- **Achado de bug real corrigido na mesma revisão, ANTES deste plan-mode** (commit `3a98611`,
  já fechado): `job_descoberta_transferegov.py` gravava a notificação de "proposta atualizada" com
  `tipo=atualizacao_api` mas `entidade_id` de uma `PropostaCandidata` — o contrato do modelo
  resolve `atualizacao_api` sempre contra `InstrumentoEquipamento.id`, então o destino podia
  resolver pro instrumento errado. Corrigido pra `tipo=proposta_candidata`. Este plan-mode
  **depende** dessa correção estar em produção (a materialização de destinatário abaixo confia no
  `tipo` pra saber que bucket de resolução usar).
- **Overlap de arquivo com outra sessão em andamento**: `sigeo-final-closure-plan` está decompondo
  `backend/app/routers/monitoramento.py` pro padrão Router→Service→Repository completo (Bloco 2 do
  `planmode-fechamento-final-2026-09-25.md` dela), tocando exatamente
  `monitoramento_eventos.py`/`monitoramento_instrumentos.py` — os mesmos arquivos onde este
  plan-mode precisa materializar destinatário no PATCH de instrumento/evento. **Bloco 0 deste
  plano só começa depois que a outra sessão sinalizar o Bloco 2 dela concluído e commitado.**

## Decisões tomadas com o usuário (2026-09-25, antes de codar)

- **`gestor`/`admin` recebem TODAS as notificações** (visão gerencial completa), independente de
  estarem designados como titular/suplente de algum instrumento. `colaborador` é o único perfil
  escopado por `InstrumentoResponsavel`.
- **`leitor` não recebe nenhuma notificação** — mesmo sendo, hipoteticamente, titular/suplente de
  algum instrumento (não deveria acontecer na prática, já que designação é feita por quem edita
  monitoramento, mas a regra de leitura é explícita: sino fica vazio/oculto pra esse perfil).
- **`lida` passa a ser por usuário, não mais compartilhado** — nova tabela
  `notificacao_destinatario` (não um filtro de leitura em cima da tabela atual). Resolvido no
  momento da CRIAÇÃO da notificação, não em tempo de leitura.
- **Alerta de vigência sem monitoramento interno dispara como broadcast** pra todos os
  colaboradores (mesma regra do item 2 do objetivo) — a ausência de técnico designado não bloqueia
  o aviso, porque a proximidade do fim da vigência já é relevante o bastante pra alguém decidir se
  vale monitorar.

## Desenho técnico

### Schema novo

`NotificacaoDestinatario` — `id`, `notificacao_id` (FK `notificacao.id`, `ondelete=CASCADE`),
`usuario_id` (FK `user.id`, `ondelete=CASCADE`), `lida: bool` (`server_default=false`), `lida_em`,
`created_at`. `UniqueConstraint(notificacao_id, usuario_id)`. Índice
`(usuario_id, lida, created_at)` pro mesmo padrão de paginação que `idx_notificacao_lida_created`
já usa hoje.

`Notificacao.lida` (coluna atual) fica **deprecated, mantida só pra não quebrar migration em voo**
— não lida nem escrita por nenhum código novo. Removida numa migration futura separada, depois que
não houver mais consumidor (checagem explícita antes de remover, mesmo padrão já usado neste
projeto pra schemas mortos).

### Regra de materialização de destinatário (no momento do INSERT de `Notificacao`)

Função nova `resolver_destinatarios(db, *, tipo: NotificacaoTipo, entidade_id: int) -> list[int]`
em `app/repositories/notificacoes.py`, chamada por todo ponto que hoje faz `db.add(Notificacao(...))`
ou `Notificacao(...)` (4 pontos: `job_verificacao_siconv.py`, `job_verificacao_transferegov.py`,
`job_descoberta_transferegov.py`, `monitoramento_eventos.py`, + o novo `job_alerta_vigencia.py`):

- `tipo in (atualizacao_api, edicao_manual)` com instrumento monitorado → titular + suplente
  (`InstrumentoResponsavel` do `instrumento_id`) **união** com todo `User` ativo de role
  `gestor`/`admin`. Sem titular/suplente cadastrado → cai no broadcast abaixo (nunca fica órfã).
- `tipo == proposta_candidata` (proposta nova/atualizada, nunca tem instrumento monitorado) →
  broadcast: todo `User` ativo de role `colaborador`/`gestor`/`admin`.
- `tipo` novo `alerta_vigencia` → titular + suplente quando existir instrumento monitorado pro
  `nr_convenio`; sem instrumento monitorado → broadcast (mesma lista de `proposta_candidata`).
- `leitor` nunca entra em nenhuma lista, em nenhum branch.

Usuário `status != active` (inativado, ver módulo de gestão de usuários) nunca entra em nenhuma
lista — evita notificação materializada pra conta desligada.

### Novo tipo `alerta_vigencia` + job

`NotificacaoTipo` ganha `alerta_vigencia` (migration adiciona ao enum Postgres nativo — `ALTER TYPE
... ADD VALUE`, fora de transação, mesmo cuidado já documentado em outras migrations deste projeto
que mexem em enum nativo).

`backend/scripts/job_alerta_vigencia.py` (novo, mesmo padrão dos outros 3 jobs — `SessionLocal`
direto, roda dentro de `radar_convenios.yml` junto dos demais):

- Varre `Convenio` com `data_final_vigencia` entre hoje e hoje+90 dias.
- Dedup: não reemite se já existe uma `Notificacao(tipo=alerta_vigencia)` pro mesmo `entidade_id`
  (aqui `entidade_id` é `Convenio.id`, um 4º valor no esquema polimórfico) nos últimos 30 dias —
  evita repetir todo dia durante a janela de 90, mas reemite mensalmente se ninguém agir. Critério
  de "últimos 30 dias" fica configurável como constante no topo do arquivo, não hardcoded inline.
- Cruza `Convenio.numero` ↔ `InstrumentoEquipamento.nr_convenio` só pra resolver destinatário
  (titular/suplente vs. broadcast) — não lê nem grava nada em `instrumento_equipamento`.

### Leitura (`GET /notificacoes`, `PATCH /notificacoes/{id}`)

`repositories/notificacoes.py::listar_notificacoes_paginadas` passa a fazer JOIN com
`NotificacaoDestinatario` filtrado por `usuario_id = current_user.id`; `nao_lidas` conta
`NotificacaoDestinatario.lida = false` do usuário, não mais da tabela toda. `PATCH
/notificacoes/{id}` marca a linha do destinatário do usuário autenticado (404 se o usuário não é
destinatário dessa notificação — não pode marcar como lida algo que não é dele).

### Migration de dado legado

Notificações existentes (antes da migration) não ganham `NotificacaoDestinatario` retroativo —
ficam sem destinatário, o que as torna invisíveis no novo `GET /notificacoes` escopado. Aceitável
pra dado histórico (mesmo critério já usado na reversão do 877881 e noutras migrations deste
projeto: não fabricar destinatário que não dá pra reconstruir com certeza — titular/suplente
"atual" no momento da migration pode não ser quem era responsável quando a notificação foi
gerada).

## Fora de escopo (declarado explicitamente, não esquecer depois)

- RBAC granular por UF/órgão — já registrado como pendência maior em `diagnostico-constituicao-
  seguranca-2026-09-16.md`; este plano só resolve o recorte por `InstrumentoResponsavel`, que é
  mais estreito.
- Diferenciar rótulo/ícone no front por origem (SICONV vs. TransfereGov novo vs. monitoramento
  interno) além do que `NotificacaoTipo` já distingue — o pedido do usuário foi sobre **quem
  recebe**, não sobre granularidade visual adicional; se quiser isso depois, é mudança de front
  isolada, sem depender deste schema.
- "Marcar todas como lidas" em lote — já registrado como sugestão de melhoria na revisão anterior,
  continua fora, não é bloqueio pro escopo pedido aqui.
- Remoção física da coluna `Notificacao.lida` — fica deprecated nesta rodada, remoção é migration
  separada futura.

## Ordem de execução

- **Bloco 0 — CONCLUÍDO (2026-09-25)**: migration `488a535a0b5e` (tabela `notificacao_destinatario`
  + `ALTER TYPE notificacao_tipo ADD VALUE 'alerta_vigencia'`), validada contra Postgres real (banco
  local de teste, não a produção — aplicada em cadeia junto da migration `9c2e4f7a1d38` da sessão
  paralela, que encadeou em cima desta). `resolver_destinatarios`/`criar_notificacao` em
  `repositories/notificacoes.py`; os 4 pontos de inserção existentes (`job_verificacao_siconv.py`,
  `job_verificacao_transferegov.py`, `job_descoberta_transferegov.py` ×2, `monitoramento_eventos.py`
  via `repositories/monitoramento.py::adicionar_notificacao`) migrados pra `criar_notificacao`.
  `job_alerta_vigencia.py` novo, adicionado ao `radar_convenios.yml`. **Achado corrigido durante a
  implementação**: `_ids_titular_suplente_e_gestores` filtrava só por usuário ativo, sem excluir
  `role=leitor` — um leitor designado titular hipoteticamente receberia notificação, violando a
  decisão "leitor nunca recebe". Corrigido antes de rodar os testes.
- **Bloco 1 — CONCLUÍDO (2026-09-25)**: `services/notificacoes.py`/`routers/notificacoes.py`
  migrados pra leitura escopada por destinatário (`listar_notificacoes_paginadas` faz JOIN com
  `NotificacaoDestinatario` filtrado por `usuario_id`); `PATCH /notificacoes/{id}` marca a linha do
  destinatário do usuário autenticado, 404 se o usuário não é destinatário dessa notificação.
- **Bloco 2 — CONCLUÍDO (2026-09-25)**: nenhuma mudança de contrato visível além do que já existia
  (`destino`, `titulo`, `corpo` continuam iguais); rótulo "Fim de vigência" adicionado em
  `notification-bell.tsx::RÓTULO_TIPO` + `alerta_vigencia` no schema Zod de
  `services/notificacoes.ts`. `npm run lint`/`tsc --noEmit`/`vitest run` limpos (113/113).
- **Bloco 3 — CONCLUÍDO (2026-09-25)**: testes novos em `test_service_notificacoes.py` (escopo por
  papel: colaborador só vê instrumento onde é titular/suplente, gestor vê mesmo sem ser titular,
  leitor nunca recebe nada, usuário não-destinatário tenta marcar como lida → 404) +
  `test_repositories_qualidade.py`/`test_notificacoes.py` atualizados pro novo contrato
  (`criar_notificacao` em vez de `db.add(Notificacao(...))` direto, `usuario_id` explícito). 2
  testes pré-existentes precisaram de ajuste de premissa (não eram bug de produção, eram teste
  usando `entidade_id`/tipo que colidia com dado real do banco compartilhado de teste, ou testando
  um branch de fallback que gestor/admin pré-existentes tornam quase sempre inalcançável). Suíte
  completa: 236/236 backend, 113/113 frontend. `CLAUDE.md` com seção própria. `docs/database/
  modelo_er.mermaid` atualizado (entidade `NOTIFICACAO_DESTINATARIO` + relacionamentos com
  `NOTIFICACAO`/`USER`, `NOTIFICACAO.lida` marcada deprecated no diagrama).

**Status**: as 4 etapas deste Plan Mode estão concluídas. Migration aplicada contra Postgres real
(banco local de teste), suíte completa passando, documentação sincronizada.
