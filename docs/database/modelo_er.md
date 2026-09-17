# Modelo ER — SIGEO

O [`modelo_er.mermaid`](modelo_er.mermaid) cobre todas as tabelas e FKs
físicas declaradas em `backend/app/db/models.py`, fonte da verdade do schema.
Para manter o diagrama legível, cada entidade mostra chaves e campos de maior
valor estrutural; a lista completa de colunas permanece nos models e nas
migrations. As seções abaixo detalham o domínio de monitoramento, cujo fluxo
foi fechado com o usuário em 2026-09-15 (ver
[`../arquitetura/fluxo_requisicao.md`](../arquitetura/fluxo_requisicao.md)).

## Tabelas já existentes (sem mudança de schema, contexto pra entender as novas)

- **`instrumento_equipamento`** — 1 linha por instrumento monitorado
  internamente. `nr_convenio` é `UNIQUE` mas passa a acomodar 3 formatos
  diferentes conforme `tipo_contratacao`: número de convênio real
  (`Convênio`), dígitos do NUP SEI (`FAF`/`TED`), ou `id_proposta` do
  TransfereGov novo (`Parceria TransfereGov` — categoria nova). Não guarda
  `valor`/`situacao` (isso vem ao vivo do Portal da Transparência, decisão
  2026-09-03) — só o que nenhuma API pública tem (`tecnico_titular`,
  `situacao_prestacao_contas`, etc).
- **`marco_catalogo`** — catálogo fixo de marcos (fase geral/cronograma
  físico/regulatório), populado 1x por `scripts/seed_monitoramento.py`.
- **`evento_marco`** — log append-only contra o catálogo fixo. `autor_id`
  aponta pro `user` que registrou.
- **`acao_monitoramento`** — tarefa livre da equipe, `data_conclusao` é o
  único campo mutável.
- **`user`** — já tem `role` (`admin`/`colaborador`/`leitor`) e `status`
  (`app/db/models.py`, feature de autenticação em andamento) — candidato
  natural pra virar a base do RBAC de notificação (`nivel_minimo`) quando a
  hierarquia for definida; não é 1:1 com "técnico"/"acima de técnico" ainda.
- **`refresh_token`** — sessão de refresh do Plan Mode segurança Bloco 2
  (migration `5557cabd4a4c`): 1 linha por token opaco emitido, `token_hash`
  único (nunca o segredo em claro, mesmo princípio de `user.password_hash`),
  `expires_at`/`revoked_at` sustentam expiração e revogação; rotação marca
  `revoked_at` e cria linha nova em vez de reescrever. FK `user_id` com
  `ON DELETE CASCADE`/`ON UPDATE RESTRICT`. Ainda não consumida por nenhuma
  rota — tabela pronta, wiring no fluxo de auth é escopo do Plan Mode de
  segurança, não deste.
- **`audit_log`** — genérico (`entity_name`/`entity_id`/`action`/`details`),
  já escrito por toda rota de mutação via `app/audit.py::log_action`. A
  notificação de camada 2 (edição manual) nasce a partir daqui — não precisa
  de rastreamento novo, só uma leitura filtrada por `entity_name =
  'instrumento_equipamento'`.
- **`cnes_estabelecimento`** — referência local de estabelecimentos CNES para
  validação de CNES em convênios, instrumentos e propostas. Desde a migration
  `e3a9c5b7d2f1`, inclui `latitude`, `longitude` e `fonte_sincronizacao`
  (`s3`/`elasticnes` ou outro valor informado pelo sincronizador). Desde
  `a7c4e1f9b203`, `convenio.cnes`, `instrumento_equipamento.cnes` e
  `proposta_candidata.cnes` têm FK física (`ON DELETE SET NULL`,
  `ON UPDATE RESTRICT`), com CHECKs de formato/coordenada na própria
  referência. Desde `c9f1a4d7e602`, todas as FKs mapeadas declaram também
  `ON UPDATE RESTRICT` explicitamente.

## Tabelas novas

### `proposta_candidata`

Uma linha por proposta do TransfereGov novo encontrada pelo job de
descoberta, ainda não decidida. Detalhe generoso de propósito — a equipe
revisa sem precisar reconsultar a API ao vivo (embora o link "ver ao vivo"
continue disponível).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | bigint, PK | |
| `id_proposta` | int, `UNIQUE` | Chave de dedup — TransfereGov próprio, nunca comparado contra `nr_convenio` do legado (são universos disjuntos, ver `fluxo_requisicao.md`) |
| `cnpj_ente_recebedor` | string | |
| `nm_proponente` | string | |
| `municipio` / `uf` | string, nullable | |
| `ds_objeto` | string | Texto livre — mesmo campo usado pro casamento de equipamento |
| `nm_programa` / `id_programa` | string, int | |
| `componente_batido` | string | 1 dos 8 `COMPONENTES_ALVO` |
| `equipamento_detectado` | string, nullable | Casamento contra `EQUIPAMENTOS_ALVO` (mesmo padrão de `frontend/src/lib/equipamento-tags.ts`) |
| `cnes` | string(7), nullable, FK → `cnes_estabelecimento.cnes` | `ON DELETE SET NULL` / `ON UPDATE RESTRICT` |
| `vl_global_proposta` | numeric, nullable | |
| `situacao_proposta` | string | |
| `data_proposta` | date, nullable | |
| `metas_resumo` | jsonb | `meta_proposta`/`item_proposta` capturados no momento da descoberta |
| `tem_parceria` | bool | Já virou `parceria` formalizada na API? |
| `status` | enum: `pendente`/`aceita`/`rejeitada` | |
| `revisado_por` | FK → `user.id`, nullable | |
| `revisado_em` | timestamptz, nullable | |
| `created_at` | timestamptz | |

Quando `status` vira `aceita`, a aplicação cria `instrumento_equipamento` na
mesma transação, com `nr_convenio = cd_parceria` quando existir ou
`str(id_proposta)` como fallback, e `tipo_contratacao = "Parceria
TransfereGov"`. É o mesmo padrão de identificador surrogate que `FAF`/`TED`
já usam (NUP SEI), mas sem `commit` intermediário entre instrumento e proposta.

### `notificacao`

| Campo | Tipo | Observação |
|---|---|---|
| `id` | bigint, PK | |
| `tipo` | enum: `proposta_candidata`/`atualizacao_api`/`edicao_manual` | |
| `titulo` / `corpo` | string | |
| `entidade_id` | bigint | Aponta pra `proposta_candidata.id` (tipo `proposta_candidata`) ou `instrumento_equipamento.id` (os outros 2 tipos) — sem FK física de propósito, `tipo` já desambigua qual tabela |
| `nivel_minimo` | string, nullable | RBAC — candidato: reaproveitar `UserRole` quando a hierarquia for fechada |
| `lida` | bool, default `false` | |
| `created_at` | timestamptz | |

## Relacionamentos-chave que o diagrama destaca

- `proposta_candidata` → `instrumento_equipamento`: não é FK de banco (são
  identificadores textuais diferentes, `id_proposta` int vs `nr_convenio`
  string) — a ligação é por convenção (`nr_convenio = str(id_proposta)`
  depois de aceita, ou `cd_parceria` quando a parceria já existe), verificada
  na aplicação antes de criar.
- `audit_log.entity_id` → `instrumento_equipamento.id`: já existe hoje,
  usada como origem da notificação de camada 2 (não uma tabela nova).
- `notificacao.entidade_id`: polimórfico por `tipo`, resolvido na
  aplicação — mesma decisão de design que `audit_log` já usa
  (`entity_name` + `entity_id`), pra não multiplicar tabela de notificação
  por tipo de entidade.
- `cnes_estabelecimento.cnes`: FK física desde `a7c4e1f9b203` para
  `convenio.cnes`, `instrumento_equipamento.cnes` e
  `proposta_candidata.cnes` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`).
  Auditoria prévia no clone carregado (`par_equipamentos_pytest_loaded`)
  não encontrou órfãos.


## Integridade física consolidada em 2026-09-16

Além das FKs CNES, o fechamento da constituição database adicionou CHECKs
físicos para invariantes simples que não dependem de regra externa mutável:
populações, quantidades, estimativas, distâncias e tempos calculados não
podem ser negativos; `marco_catalogo.execucao_fisica_pct_referencia` fica
entre 0 e 1; `instrumento_equipamento.equipamento_vida_util_anos` não pode
ser negativo. Relações polimórficas (`audit_log.entity_id` e
`notificacao.entidade_id`) continuam sem FK física por desenho, porque a
tabela de destino depende do tipo da entidade.
