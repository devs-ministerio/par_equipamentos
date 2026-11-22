# Dicionário de dados: Itens e entregas

Itens do plano de aplicação, entregas físicas e classificação de equipamentos. Gerado do schema real no head `d9e0f1a2b3c4` e dos modelos em `backend/app/db/`. Legenda e convenções em [README](README.md).

## `item_plano`

Item planejado do instrumento, projeção da fonte; base do controle por unidade.

Chave primária: `id`. Colunas: 21. Uso: 2.543 linhas em produção (contagem exata de 22/11/2026).

Projeção do SICONV por `ID_ITEM_PAD`, ou `manual:{numero}:{ordem}`. Cada item é um equipamento distinto; entrega acima do planejado é bloqueada.

Monitorado por item: as 16 famílias com `controle_por_unidade` ou unidade com valor a partir de R$ 300 mil (`LIMITE_VALOR_UNITARIO_MONITORADO`). Rendimento de aplicação não soma unidade nem valor.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `catalogo_id` | [`equipamento_catalogo`](itens-entregas.md#equipamento_catalogo).`id` | RESTRICT |
| `convenio_id` | [`convenio`](carteira-monitoramento.md#convenio).`id` | RESTRICT |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | RESTRICT |
| `item_principal_id` | [`item_plano`](itens-entregas.md#item_plano).`id` | RESTRICT |

Restrições:

- Único `uq_item_plano_origem`: (origem, id_origem)
- `ck_item_plano_codigo`: CHECK (((codigo_item IS NULL) OR ((codigo_item) ~ '^[0-9]{6}$')))
- `ck_item_plano_codigo_fonte`: CHECK (((codigo_fonte IS NULL) OR ((codigo_fonte) = ANY ([('descricao'), ('nome_renem'), ('regra_da_equipe'), ('definido_pela_equipe')]))))
- `ck_item_plano_origem`: CHECK (((origem) = ANY ([('siconv'), ('transferegov'), ('manual')])))
- `ck_item_plano_quantidade`: CHECK (((quantidade_planejada IS NULL) OR (quantidade_planejada >= 1)))
- `ck_item_plano_situacao_classificacao`: CHECK (((situacao_classificacao) = ANY ([('aplicada'), ('pendente')])))
- `ck_item_plano_tipo_lancamento`: CHECK (((tipo_lancamento) = ANY ([('aquisicao'), ('rendimento_aplicacao'), ('acessorio_insumo'), ('multiplo'), ('nao_equipamento')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `convenio_id` | bigint | não | Referência a `convenio.id`. | FK `convenio.id` (RESTRICT) |
| `instrumento_id` | bigint | sim | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (RESTRICT) |
| `origem` | texto | não | Origem do item: siconv, transferegov ou manual. |  |
| `id_origem` | texto | não | Identificador do item na origem (`ID_ITEM_PAD` do SICONV) ou `manual:{numero}:{ordem}`. |  |
| `codigo_item` | varchar(6) | sim | Código RENEM do item (6 dígitos); nulo se não classificado. |  |
| `codigo_fonte` | texto | sim | Como o código foi definido: descricao, nome_renem, regra_da_equipe ou definido_pela_equipe. |  |
| `descricao` | texto | não | Descrição do item. |  |
| `catalogo_id` | bigint | sim | Referência a `equipamento_catalogo.id`. | FK `equipamento_catalogo.id` (RESTRICT) |
| `controla_unidade` | boolean | não | Se o item é acompanhado por unidade física (marca, modelo, série). | padrão `false` |
| `quantidade_planejada` | integer | sim | Quantidade planejada (≥ 1); nula quando desconhecida. |  |
| `ativo` | boolean | não | Se o item está vigente. | padrão `true` |
| `removido_na_fonte_em` | timestamptz | sim | Quando o item deixou de aparecer na fonte. |  |
| `hash_conteudo` | texto | sim | Hash do conteúdo do item na fonte; detecta mudança. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `atualizado_em` | timestamptz | não | Data e hora da última atualização. | padrão `now()` |
| `tipo_lancamento` | texto | não | Rendimento da aplicação não soma unidade e aponta para o item principal do mesmo convênio. | padrão `'aquisicao'` |
| `situacao_classificacao` | texto | não | Classificação: aplicada ou pendente. | padrão `'aplicada'` |
| `motivo_classificacao` | texto | sim | Motivo da classificação. **A confirmar.** |  |
| `valor_total` | numeric(16,2) | sim | Valor total do item. |  |
| `item_principal_id` | bigint | sim | Referência a `item_plano.id`. | FK `item_plano.id` (RESTRICT) |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `motivo_classificacao`.

## `entrega_equipamento`

Ato de entrega ligado ao evento `cronograma_entrega`.

Chave primária: `id`. Colunas: 12. Uso: 433 linhas em produção (contagem exata de 22/11/2026).

Append-only por regra da aplicação, não do banco: a API corrige criando registro novo e exclui por soft delete com motivo. Não há trigger que impeça UPDATE ou DELETE físico.

A FK para o instrumento é RESTRICT; não há DELETE físico direto no código.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `evento_id` | [`evento_marco`](carteira-monitoramento.md#evento_marco).`id` | RESTRICT |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | RESTRICT |
| `substituido_por_id` | [`entrega_equipamento`](itens-entregas.md#entrega_equipamento).`id` | RESTRICT |

Restrições:

- Único `uq_entrega_equipamento_idempotencia`: (chave_idempotencia)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (RESTRICT) |
| `evento_id` | bigint | sim | Referência a `evento_marco.id`. | FK `evento_marco.id` (RESTRICT) |
| `data_ocorrencia` | date | não | Data da entrega. |  |
| `observacao` | texto | sim | Observação livre. |  |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (RESTRICT) |
| `chave_idempotencia` | texto | não | Chave que impede registrar a mesma entrega duas vezes. |  |
| `substituido_por_id` | bigint | sim | Registro que corrigiu este; nulo enquanto este é a versão vigente. | FK `entrega_equipamento.id` (RESTRICT) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (RESTRICT) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `unidade_equipamento`

Unidade física entregue (marca, modelo, série, vida útil); nasce na entrega.

Chave primária: `id`. Colunas: 9. Uso: 488 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `entrega_id` | [`entrega_equipamento`](itens-entregas.md#entrega_equipamento).`id` | RESTRICT |
| `item_id` | [`item_plano`](itens-entregas.md#item_plano).`id` | RESTRICT |

Restrições:

- Único `uq_unidade_equipamento_ordem`: (item_id, ordem)
- Único `uq_unidade_equipamento_serie`: USING btree (item_id, numero_serie) WHERE (numero_serie IS NOT NULL)
- `ck_unidade_equipamento_vida_util`: CHECK (((vida_util_anos IS NULL) OR (vida_util_anos >= 0)))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `entrega_id` | bigint | não | Referência a `entrega_equipamento.id`. | FK `entrega_equipamento.id` (RESTRICT) |
| `item_id` | bigint | não | Referência a `item_plano.id`. | FK `item_plano.id` (RESTRICT) |
| `ordem` | integer | não | Posição da unidade entre as do item. |  |
| `marca` | texto | sim | Marca do equipamento. |  |
| `modelo` | texto | sim | Modelo do equipamento. |  |
| `numero_serie` | texto | sim | Número de série. |  |
| `vida_util_anos` | integer | sim | Vida útil em anos (≥ 0). |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `cancelamento_unidade_planejada`

Cancelamento de unidade planejada de item ainda não entregue.

Chave primária: `id`. Colunas: 8. Uso: só existe no head `d9e0f1a2b3c4`; produção ainda não a tem.

Só existe no head. Append-only.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `item_id` | [`item_plano`](itens-entregas.md#item_plano).`id` | RESTRICT |

Restrições:

- `ck_cancelamento_unidade_motivo`: CHECK ((length(btrim(motivo)) > 0))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `item_id` | bigint | não | Referência a `item_plano.id`. | FK `item_plano.id` (RESTRICT) |
| `motivo` | texto | não | Motivo do cancelamento (obrigatório, não vazio). |  |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (RESTRICT) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (RESTRICT) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `previsao_entrega_item`

Previsão de entrega de um item do plano.

Chave primária: `id`. Colunas: 9. Uso: só existe no head `d9e0f1a2b3c4`; produção ainda não a tem.

Só existe no head. Append-only; uma previsão ativa por item.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `item_id` | [`item_plano`](itens-entregas.md#item_plano).`id` | RESTRICT |
| `substituido_por_id` | [`previsao_entrega_item`](itens-entregas.md#previsao_entrega_item).`id` | RESTRICT |

Restrições:

- Único `uq_previsao_entrega_item_ativa`: USING btree (item_id) WHERE ((substituido_por_id IS NULL) AND (deletado_em IS NULL))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `item_id` | bigint | não | Referência a `item_plano.id`. | FK `item_plano.id` (RESTRICT) |
| `data_prevista` | date | não | Data prevista de entrega do item (base do aviso `prazo_previsao_entrega`). |  |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (RESTRICT) |
| `substituido_por_id` | bigint | sim | Registro que corrigiu este; nulo enquanto este é a versão vigente. | FK `previsao_entrega_item.id` (RESTRICT) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (RESTRICT) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `entrega_legada_revisao`

Entrega antiga sem vínculo inequívoco a um item, à espera de revisão da equipe.

Chave primária: `id`. Colunas: 9. Uso: 3 linhas em produção (contagem exata de 22/11/2026).

Três linhas em produção. Mantida: `notificacoes` e o script de retirada do PERSUS II a usam. `resolvida_em` e `resolvida_por_id` nunca foram preenchidas.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `entrega_id` | [`entrega_equipamento`](itens-entregas.md#entrega_equipamento).`id` | RESTRICT |
| `evento_id` | [`evento_marco`](carteira-monitoramento.md#evento_marco).`id` | RESTRICT |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | RESTRICT |
| `resolvida_por_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |

Restrições:

- Único `uq_entrega_legada_revisao_evento`: (evento_id)
- `ck_entrega_legada_revisao_motivo`: CHECK (((motivo) = ANY ([('varios_itens'), ('sem_item_controlado'), ('varias_entregas'), ('quantidade_desconhecida')])))
- `ck_entrega_legada_revisao_situacao`: CHECK (((situacao) = ANY ([('pendente'), ('resolvida')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (RESTRICT) |
| `evento_id` | bigint | não | Referência a `evento_marco.id`. | FK `evento_marco.id` (RESTRICT) |
| `motivo` | texto | não | Por que a entrega antiga não casou: varios_itens, sem_item_controlado, varias_entregas ou quantidade_desconhecida. |  |
| `situacao` | texto | não | pendente ou resolvida. | padrão `'pendente'` |
| `resolvida_em` | timestamptz | sim | Quando foi resolvida; sem uso (nulo em todas as linhas). |  |
| `resolvida_por_id` | bigint | sim | Referência a `user.id`. | FK `user.id` (RESTRICT) |
| `entrega_id` | bigint | sim | Referência a `entrega_equipamento.id`. | FK `entrega_equipamento.id` (RESTRICT) |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `decisao_classificacao_item`

Decisão de classificação de um item do plano de aplicação.

Chave primária: `id`. Colunas: 11. Uso: 78 linhas em produção (contagem exata de 22/11/2026).

Append-only por regra da aplicação, não do banco: a API corrige criando registro novo e exclui por soft delete com motivo. Não há trigger que impeça UPDATE ou DELETE físico. A decisão nova atualiza `substituida_por_id` da anterior.

Liga a `convenio` por `convenio_numero`, sem FK. Fila de revisão em `/monitoramento-equipamentos/revisao-itens`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `substituida_por_id` | [`decisao_classificacao_item`](itens-entregas.md#decisao_classificacao_item).`id` | RESTRICT |

Restrições:

- Único `uq_decisao_class_item_vigente`: USING btree (convenio_numero, chave_item) WHERE (substituida_por_id IS NULL)
- `ck_decisao_class_item_codigo`: CHECK (((codigo_item IS NULL) OR ((codigo_item) ~ '^[0-9]{6}$')))
- `ck_decisao_class_item_origem`: CHECK (((origem) = ANY ([('motor'), ('revisao_equipe'), ('tecnico')])))
- `ck_decisao_class_item_status`: CHECK (((status) = ANY ([('aplicada'), ('pendente')])))
- `ck_decisao_class_item_tipo`: CHECK (((tipo_lancamento) = ANY ([('aquisicao'), ('rendimento_aplicacao'), ('acessorio_insumo'), ('multiplo'), ('nao_equipamento')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `convenio_numero` | texto | não | Número do convênio (liga a `convenio.numero`, sem FK). |  |
| `chave_item` | texto | não | `ID_ITEM_PAD` do SICONV; na carga manual, hash do texto normalizado do item. |  |
| `tipo_lancamento` | texto | não | aquisicao, rendimento_aplicacao, acessorio_insumo, multiplo ou nao_equipamento. |  |
| `codigo_item` | varchar(6) | sim | Código RENEM do item (6 dígitos); opcional. |  |
| `conta_unidade` | boolean | sim | Se o item conta como unidade. |  |
| `origem` | texto | não | Quem decidiu: motor, revisao_equipe ou tecnico. |  |
| `status` | texto | não | aplicada ou pendente. | padrão `'aplicada'` |
| `observacao` | texto | sim | Observação livre. |  |
| `substituida_por_id` | bigint | sim | Referência a `decisao_classificacao_item.id`. | FK `decisao_classificacao_item.id` (RESTRICT) |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `equipamento_catalogo`

Dicionário canônico das famílias de equipamento acompanhadas.

Chave primária: `id`. Colunas: 10. Uso: 182 linhas em produção (contagem exata de 22/11/2026).

O nome exibido vem da RENEM (`ItemEquipamentoRead.nome`).

Restrições:

- Único `uq_equipamento_catalogo_codigo`: (codigo)
- Único `uq_equipamento_catalogo_nome`: (nome)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `codigo` | texto | não | Código da família de equipamento. |  |
| `nome` | texto | não | Nome da família. |  |
| `prioritario` | boolean | não | Se a família faz parte do roll prioritário. | padrão `false` |
| `ativo` | boolean | não | Se a família está ativa. | padrão `true` |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `atualizado_em` | timestamptz | não | Data e hora da última atualização. | padrão `now()` |
| `controle_por_unidade` | boolean | não | Famílias cujo item é acompanhado por unidade física (marca, modelo, série) na entrega. | padrão `false` |
| `nome_oficial` | texto | sim | Nome oficial da família; o nome exibido vem da RENEM. |  |
| `exige_licenca` | boolean | não | Famílias cujo equipamento precisa de licença da ANSN (radioterapia, medicina nuclear). | padrão `false` |

## `renem_item`

Item da RENEM (Relação Nacional de Equipamentos e Materiais Permanentes, FNS).

Chave primária: `id`. Colunas: 11. Uso: 840 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `catalogo_id` | [`equipamento_catalogo`](itens-entregas.md#equipamento_catalogo).`id` | RESTRICT |

Restrições:

- Único `uq_renem_item_codigo_versao`: (codigo_item, versao_lista)
- `ck_renem_item_codigo`: CHECK (((codigo_item) ~ '^[0-9]{6}$'))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `codigo_item` | varchar(6) | não | Código do item na RENEM (6 dígitos). |  |
| `nome` | texto | não | Nome oficial do item. |  |
| `definicao` | texto | sim | Definição do item. **A confirmar.** |  |
| `classificacao` | texto | sim | Classificação do item. **A confirmar.** |  |
| `valor_sugerido` | numeric(16,4) | sim | Valor sugerido pela lista. |  |
| `item_dolarizado` | boolean | sim | Se o valor é dolarizado. **A confirmar.** |  |
| `versao_lista` | texto | não | Versão da lista RENEM de origem. |  |
| `catalogo_id` | bigint | sim | Referência a `equipamento_catalogo.id`. | FK `equipamento_catalogo.id` (RESTRICT) |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `atualizado_em` | timestamptz | não | Data e hora da última atualização. | padrão `now()` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `definicao`, `classificacao`, `item_dolarizado`.

## `codigo_item_legado`

Código que aparece nos dados mas não consta da RENEM vigente.

Chave primária: `id`. Colunas: 6. Uso: 6 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `catalogo_id` | [`equipamento_catalogo`](itens-entregas.md#equipamento_catalogo).`id` | RESTRICT |

Restrições:

- Único `uq_codigo_item_legado_codigo`: (codigo_item)
- `ck_codigo_item_legado_codigo`: CHECK (((codigo_item) ~ '^[0-9]{6}$'))
- `ck_codigo_item_legado_origem`: CHECK (((origem) = ANY ([('dados'), ('usuario')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `codigo_item` | varchar(6) | não | Código de item de 6 dígitos. |  |
| `nome` | texto | não | Nome do item. |  |
| `catalogo_id` | bigint | não | Referência a `equipamento_catalogo.id`. | FK `equipamento_catalogo.id` (RESTRICT) |
| `origem` | texto | não | Origem: dados ou usuario. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `equipamento_marcador`

Evidência de equipamento ligada a exatamente uma entidade de origem (convênio, proposta ou instrumento).

Chave primária: `id`. Colunas: 13. Uso: 1.383 linhas em produção (contagem exata de 22/11/2026).

O marcador vale pelo que o item é, não pelo que menciona (`classificar_descricoes`).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `convenio_id` | [`convenio`](carteira-monitoramento.md#convenio).`id` | CASCADE |
| `equipamento_catalogo_id` | [`equipamento_catalogo`](itens-entregas.md#equipamento_catalogo).`id` | RESTRICT |
| `instrumento_equipamento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | CASCADE |
| `proposta_candidata_id` | [`proposta_candidata`](radar.md#proposta_candidata).`id` | CASCADE |

Restrições:

- Único `uq_equipamento_marcador_convenio`: USING btree (convenio_id, equipamento_catalogo_id, chave_evidencia) WHERE (convenio_id IS NOT NULL)
- Único `uq_equipamento_marcador_instrumento`: USING btree (instrumento_equipamento_id, equipamento_catalogo_id, chave_evidencia) WHERE (instrumento_equipamento_id IS NOT NULL)
- Único `uq_equipamento_marcador_proposta`: USING btree (proposta_candidata_id, equipamento_catalogo_id, chave_evidencia) WHERE (proposta_candidata_id IS NOT NULL)
- `ck_equipamento_marcador_confianca`: CHECK (((confianca >= 0) AND (confianca <= 100)))
- `ck_equipamento_marcador_relacao`: CHECK (((relacao) = ANY ([('aquisicao'), ('modernizacao'), ('existente'), ('mencao')])))
- `ck_equipamento_marcador_tipo_evidencia`: CHECK (((tipo_evidencia) = ANY ([('item_orcamentario'), ('meta'), ('objeto'), ('planilha'), ('programa'), ('legado')])))
- `ck_equipamento_marcador_uma_origem`: CHECK ((((((convenio_id IS NOT NULL)) + ((proposta_candidata_id IS NOT NULL))) + ((instrumento_equipamento_id IS NOT NULL))) = 1))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `equipamento_catalogo_id` | bigint | não | Referência a `equipamento_catalogo.id`. | FK `equipamento_catalogo.id` (RESTRICT) |
| `convenio_id` | bigint | sim | Referência a `convenio.id`. | FK `convenio.id` (CASCADE) |
| `proposta_candidata_id` | bigint | sim | Referência a `proposta_candidata.id`. | FK `proposta_candidata.id` (CASCADE) |
| `instrumento_equipamento_id` | bigint | sim | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (CASCADE) |
| `descricao_original` | texto | não | Texto original que gerou a evidência. |  |
| `tipo_evidencia` | texto | não | Tipo: item_orcamentario, meta, objeto, planilha, programa ou legado. |  |
| `relacao` | texto | não | Relação com o equipamento: aquisicao, modernizacao, existente ou mencao. |  |
| `confianca` | integer | não | Confiança da evidência (0 a 100). |  |
| `chave_evidencia` | texto | não | Chave que evita gravar a mesma evidência duas vezes. **A confirmar.** |  |
| `origem_dado` | texto | sim | Proveniência da evidência. **A confirmar.** |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `atualizado_em` | timestamptz | não | Data e hora da última atualização. | padrão `now()` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `chave_evidencia`, `origem_dado`.
