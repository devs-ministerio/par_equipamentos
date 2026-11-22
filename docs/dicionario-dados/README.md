# Dicionário de dados do SISGEO

Este dicionário descreve as 50 tabelas e as 596 colunas do banco no head `d9e0f1a2b3c4`. Foi gerado do schema real (cópia de ensaio `sigeo_ensaio_release_20261122`) e dos modelos em `backend/app/db/models.py`, `models_legado.py` e `models_recaptura_legado.py`. Para o desenho das ligações, veja o [mapa do banco](../mermaid/banco-de-dados.md).

Produção ainda está em `e9f0a1b2c3d4`. As 7 tabelas que só existem no head trazem essa marca na página.

## Índice

| Domínio | Tabelas | Colunas | Página |
| --- | --- | --- | --- |
| Cobertura (análise de mérito) | 10 | 115 | [cobertura.md](cobertura.md) |
| Carteira e monitoramento | 14 | 221 | [carteira-monitoramento.md](carteira-monitoramento.md) |
| Itens e entregas | 11 | 119 | [itens-entregas.md](itens-entregas.md) |
| Radar de instrumentos | 9 | 96 | [radar.md](radar.md) |
| Acesso e avisos | 5 | 44 | [acesso-avisos.md](acesso-avisos.md) |
| Controle de migrations | 1 | 1 | [controle-alembic.md](controle-alembic.md) |

## Como ler uma página

Cada tabela traz a finalidade, a chave primária, a contagem de linhas em produção (exata, de 22/11/2026), as regras de negócio que valem para ela, as chaves estrangeiras com o comportamento ao excluir, as restrições (únicos, CHECKs e triggers) e a lista de colunas.

Na lista de colunas, **Tipo** vem do catálogo do Postgres (`texto` é `varchar` sem limite). **Nulo** diz se a coluna aceita nulo. **Regra** junta chave, destino de FK, valor padrão e valores de enum. A **Descrição** vem, nesta ordem, de uma redação curada a partir do código, dos comentários do modelo ou de uma regra mecânica para colunas genéricas (`id`, `criado_em`, `deletado_em`).

## A confirmar

Descrição inferida do nome da coluna, ou sem fonte no código, aparece com **A confirmar.** na célula e num bloco `> [!warning] A confirmar` ao fim da tabela. Nada foi inventado: onde o código não explica o campo, a página diz isso.

Há 40 colunas marcadas, em 4 domínios (carteira 26, itens 6, radar 6, cobertura 2). Dois assuntos pedem decisão da equipe, além das colunas:

> [!warning] A confirmar
> Significado das siglas de tipologia (A, CV, C, EO, C.B, NA) e vocabulário de `nivel_monitoramento` e `natureza_servico`. O código guarda os valores, mas não explica o que cada um quer dizer.

> [!warning] A confirmar
> Fonte que manda na situação do programa quando monitoramento e carteira divergem (5 pares PERSUS I em 22/11/2026), e origem dos 2 FAF sem contraparte na carteira. Ver [diagnóstico do Codex](../diagnosticos/diagnostico-banco-codex-2026-11-22.md).

## Convenções do banco

Identificadores técnicos continuam `sigeo_*` (cookies, papéis do Postgres, prefixo do R2) mesmo depois da troca de nome do produto para SISGEO. Nomes de tabelas e colunas misturam português e inglês: as tabelas de cobertura, `user`, `refresh_token`, `audit_log` e `notificacao.created_at` usam inglês; carteira, monitoramento, itens e Radar usam português. O dicionário mantém os nomes como estão.

Datas e horas são `timestamptz` (74 colunas, nenhuma sem fuso). Valores em Real são `numeric`. Identificadores com zeros à esquerda (CNES, CNPJ, códigos de item) são texto.

## Regras que valem para várias tabelas

**Append-only é regra da aplicação, não do banco.** `evento_marco`, `acao_monitoramento`, `entrega_equipamento` e `decisao_classificacao_item` não têm trigger que impeça UPDATE ou DELETE físico. A API corrige criando registro novo e aponta o antigo por `substituido_por_id`, e exclui por soft delete com motivo. Registro ativo é `substituido_por_id IS NULL AND deletado_em IS NULL`. Só `candidato_legado_decisao` (`trg_decisao_legado_imutavel`) e `candidato_legado_recaptura` (`recaptura_legado_append_only`) têm trigger de imutabilidade no banco. Há DELETE físico em scripts de correção e `ON DELETE CASCADE` do instrumento para eventos e ações.

**Cobertura conta só oferta SUS e em uso.** O cálculo usa `sus_flag = true` e `in_use_qty` (`available_qty`), nunca `existing_qty`, que é informativo. A fonte da regra é `docs/metodologia-parametros.md`. Dado do monitoramento interno nunca entra no cálculo de cobertura.

**Autoria e exclusão lógica.** `autor_id` e `deletado_por_id` apontam para `user` nas tabelas append-only.

## Ligações sem chave estrangeira

| De | Para | Como liga |
| --- | --- | --- |
| `instrumento_equipamento` | `convenio` | `nr_convenio` = `numero` e mesmo `tipo_contratacao` (padrão Convênio) |
| `decisao_classificacao_item` | `convenio` | `convenio_numero` |
| `notificacao` | instrumento, convênio, proposta ou candidato | `entidade_id`, resolvido por `tipo` |
| `instalacao_ansn` | `vinculo_licenca_estabelecimento` | `matricula` |
| `candidato_legado` | `convenio` | `numero` (a aprovação grava `convenio_id` na decisão) |

## Tabelas sem uso e decisões de manter

Estado de 22/11/2026, do [relatório de limpeza](../diagnosticos/relatorio-limpeza-banco-2026-11-22.md) e do [diagnóstico do Codex](../diagnosticos/diagnostico-banco-codex-2026-11-22.md). Nada foi removido.

| Tabela | Situação | Decisão |
| --- | --- | --- |
| `accelerator_row` | 0 linhas, só importação | Candidata a remoção, em migration separada |
| `inca_estimate` | 0 linhas, só importação | Candidata a remoção, em migration separada |
| `reference_file` | 2 linhas, ligada a `execution` e aos pipelines | Decidir depois |
| `municipality_population_row` | 11.140 linhas, só carga | Mantida, uso futuro (decisão de 22/11/2026) |
| `pagamento_obra_persus` | 204 linhas, nenhum leitor na API | Mantida, uso futuro (decisão de 22/11/2026) |
| `fonte_dado` | 6 linhas, com FK em convênios, instrumentos e pagamentos | Mantida: guarda a proveniência |
| `entrega_legada_revisao` | 3 linhas, usada por notificações e pelo script do PERSUS II | Mantida |
| `candidato_legado_recaptura` | 0 linhas em produção, a recaptura nunca rodou lá | Mantida, vazia por etapa ainda pendente |

Doze colunas aparecem só no modelo e estão nulas em produção: `entrega_legada_revisao.resolvida_em` e `resolvida_por_id`; `execution.executed_by`, `accelerator_file_id`, `population_file_id` e `deleted_by`; `fonte_dado.url_referencia`; `inca_estimate.capital_ibge_code`; `proposta_candidata.revisado_por` e `revisado_em`; `reference_file.reference_period` e `uploaded_by`. Cada página as descreve.

`notificacao.lida` está obsoleta; o estado de leitura vive em `notificacao_destinatario.lida`. `refresh_token` acumula linhas expiradas (697 de 844) sem rotina de purga. Os CHECKs de `snapshot_local` e `em_analise` ainda admitem valores que a aplicação não grava mais.

## Como foi gerado

As páginas saem de um script descartável que lê o catálogo do clone (`information_schema` e `pg_catalog`) e os comentários dos modelos, e aplica descrições curadas. A cobertura foi validada: cada uma das 50 tabelas do head aparece em exatamente uma página. Mudou o schema, regenere a partir do clone no head novo e revise as descrições marcadas **A confirmar.**
