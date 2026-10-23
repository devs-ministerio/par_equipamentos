# Inventário de itens de equipamento — Bloco 0 do monitoramento por item (22/10/2026)

Evidência para o [plano de monitoramento por item e equipamento físico](planmode-monitoramento-itens-equipamentos-2026-10-20.md). Somente leitura, sobre a cópia protegida `sigeo_homologacao_clone_20261017` (revisão `b7f35c806e4a`, 248 instrumentos monitorados e 560 convênios, anterior ao release; **não é a produção**, que tem 292 instrumentos monitorados). Nenhum dado de produção foi lido nem alterado.

## De onde vem o item individual

| Fonte | Onde fica no SIGEO | Chave do item | Quantidade |
|---|---|---|---|
| **SICONV legado** (plano de aplicação) | `Convenio.siconv_raw["itens_plano_aplicacao"][]` | `ID_ITEM_PAD` (texto numérico) | `QTD_ITEM` |
| **TransfereGov, API nova** (`item-proposta`) | `PropostaCandidata.metas_resumo` → `metas[].etapas_proposta[].itens[]`; relacional `evidencia_transferegov` (200 linhas na cópia) | `id_item_proposta` | `qt_quantidade` + `nm_unidade_medida` |
| **Carga manual inicial** (PERSUS, FAF, TED) | mesmo array do SICONV, marcado com `ORIGEM_ITEM`/`FONTE_ITEM` | **sem identidade oficial** | **sem `QTD_ITEM`** |

Campos do item SICONV: `ID_ITEM_PAD`, `ID_PROPOSTA`, `DESCRICAO_ITEM`, `QTD_ITEM`, `VALOR_UNITARIO_ITEM`, `VALOR_TOTAL_ITEM`, `SIGLA`, `TIPO_DESPESA_ITEM`, `COD_NATUREZA_DESPESA`, `NATUREZA_DESPESA`, `NATUREZA_AQUISICAO`, `SIT_ITEM`, endereço/CEP/município. O nome `itens_dl` não existe no código; a hipótese de trabalho é que se refere a estes itens detalhados por unidade (confirmar com o usuário).

## Números (cópia de 17/10)

- 2.597 itens em 559 de 560 convênios: **2.414 do dump SICONV** (com `ID_ITEM_PAD`) e **183 de carga manual** (sem ID e sem quantidade).
- **`ID_ITEM_PAD` é único**: nenhuma repetição dentro de um convênio nem entre convênios. Serve como chave de origem.
- 1.115 itens casam por descrição com algum marcador de equipamento. Desses, 661 têm quantidade 1, 189 têm 2 a 5, 51 têm 6 a 20, 31 passam de 20 e 183 não têm quantidade. Nenhuma quantidade é fracionária.
- 173 convênios têm mais de um item de equipamento; 200 têm soma de quantidade maior que 1.
- **45 convênios repetem a mesma descrição de equipamento em itens distintos.**
- Instrumentos: 11 de 248 têm `equipamento_descricao` com " + " (mais de um equipamento); 0 têm marca, modelo ou série preenchidos; 74 entregas ativas (`cronograma_entrega`) em 71 instrumentos, 2 instrumentos com mais de uma entrega ativa.

## Achados que mudam o desenho

1. **`QTD_ITEM` nem sempre é número de unidades.** O tipo do item vem em `TIPO_DESPESA_ITEM` (`BEM`, `OBRA`, `SERVICO`, `OUTROS`). Em `OBRA`/`SERVICO` a "quantidade" é área ou serviço (exemplos reais: 38.447, 33.039, 2.296 e 300 em itens cuja descrição apenas menciona equipamentos). Só `BEM` (naturezas 4490.52.xx, 3390.30.xx) representa unidades. **Bug em produção, ver abaixo.**
2. **O marcador de equipamento não aponta para o item.** `EquipamentoMarcador` guarda `descricao_original` e uma `chave_evidencia` em hash, sem `ID_ITEM_PAD`. O casamento item↔marcador é por texto, ambíguo nos 45 convênios com descrição repetida, e inviável para itens sem identidade. O vínculo precisa ser reconstruído com o ID do item, nunca por nome nem posição.
3. **Cargas manuais (183 itens) não têm ID nem quantidade.** Precisam de representação explícita e auditável (decisão pendente do plano), sem inventar vínculo com a API.
4. **Entrega hoje é por convênio**, com campos físicos únicos no instrumento. Já há 11 instrumentos com mais de um equipamento e 2 com mais de uma entrega, o que o modelo atual só trata por heurística.
5. **TransfereGov novo** traz quantidade e unidade de medida por item, mais rico que o SICONV; o mapa `id_item_proposta` ↔ `ID_ITEM_PAD` para o mesmo convênio ainda não foi validado e não deve ser presumido.

## Bug encontrado em produção durante o inventário

A "Quantidade" do relatório de Concluídos soma `QTD_ITEM` de itens classificados como equipamento sem filtrar por `TIPO_DESPESA_ITEM`. No arquivo de aceite de 22/10 isso gerou valores como **2.296 (convênio 851416, PET/CT)** e **600 (convênio 905903, acelerador e braquiterapia)**, que são área/serviço e não unidades. Correção proposta: somar apenas itens `BEM`; sem item `BEM`, mostrar quantidade desconhecida ("—") em vez de 1 ou do número da obra. Depende de aprovação do usuário e de deploy.

## Pendências do Bloco 0

- Itens alterados ou removidos na fonte (comparar capturas da recaptura).
- Cargas sem item oficial: decidir a representação.
- Validar `id_item_proposta` ↔ `ID_ITEM_PAD` em convênios presentes nas duas fontes.
- Inventariar produtor, destinatários e deduplicação dos avisos existentes antes de criar os de prazo (Bloco 5).
- Repetir as contagens na produção, só leitura, antes do Bloco 1.
