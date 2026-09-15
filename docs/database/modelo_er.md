# Modelo ER — Radar de Convênios

Espelho em prosa de [`modelo_er.mermaid`](modelo_er.mermaid). Cobre só as
tabelas do domínio "monitoramento de equipamento" (`instrumento_equipamento`
e as que se conectam a ela) — não duplica o restante do schema, ver
`backend/app/db/models.py` como fonte da verdade completa. Baseado no fluxo
fechado com o usuário em 2026-09-15 (ver
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
- **`audit_log`** — genérico (`entity_name`/`entity_id`/`action`/`details`),
  já escrito por toda rota de mutação via `app/audit.py::log_action`. A
  notificação de camada 2 (edição manual) nasce a partir daqui — não precisa
  de rastreamento novo, só uma leitura filtrada por `entity_name =
  'instrumento_equipamento'`.

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
| `vl_global_proposta` | numeric, nullable | |
| `situacao_proposta` | string | |
| `data_proposta` | date, nullable | |
| `metas_resumo` | jsonb | `meta_proposta`/`item_proposta` capturados no momento da descoberta |
| `tem_parceria` | bool | Já virou `parceria` formalizada na API? |
| `status` | enum: `pendente`/`aceita`/`rejeitada` | |
| `revisado_por` | FK → `user.id`, nullable | |
| `revisado_em` | timestamptz, nullable | |
| `created_at` | timestamptz | |

Quando `status` vira `aceita`, dispara `POST /monitoramento/instrumentos`
com `nr_convenio = str(id_proposta)` e `tipo_contratacao = "Parceria
TransfereGov"` — mesmo padrão de identificador surrogate que `FAF`/`TED` já
usam (NUP SEI).

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
  depois de aceita), verificada na aplicação antes do `POST` criar.
- `audit_log.entity_id` → `instrumento_equipamento.id`: já existe hoje,
  usada como origem da notificação de camada 2 (não uma tabela nova).
- `notificacao.entidade_id`: polimórfico por `tipo`, resolvido na
  aplicação — mesma decisão de design que `audit_log` já usa
  (`entity_name` + `entity_id`), pra não multiplicar tabela de notificação
  por tipo de entidade.
