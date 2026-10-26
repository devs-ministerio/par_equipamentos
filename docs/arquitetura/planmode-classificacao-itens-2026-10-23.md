# Classificação de itens por descrição e rendimento da aplicação — plano (23/10/2026)

Complementa a etapa 1 e a etapa 3 do [plano detalhado do monitoramento por item](planmode-monitoramento-itens-detalhado-2026-10-23.md). Nasce da revisão manual do usuário (`data/revisoes/revisao_codigos_RENEM_v2.xlsx`, base de 17/10/2026, RENEM de 03/03/2026, IPCA e dólar até set/2026), que apontou que **a avaliação do item pela descrição estava muito ruim** e que **os lançamentos de rendimento da aplicação precisam de um desenho próprio**. Nada aqui foi implementado; tudo na `homologacao`, em commits locais.

## 1. O que a revisão provou

Medido contra o gabarito das 77 linhas "sem código" que pareciam das 16 famílias:

| Medida | Resultado do método de palavra-chave |
|---|---|
| Família acertada nas 30 aquisições | **20 de 30 (67%)** |
| Tipo de lançamento acertado | **30 de 77 (39%)**: tudo era tratado como aquisição |
| "Pista" do código de valor mais próximo | **errada em 18 das 48** linhas com código definido |
| Resultado da revisão | 36 certas, 11 ajustes, **24 erros**, 6 a verificar |

Composição real das 77 linhas: **30 aquisições** (R$ 30,77 mi), **37 complementos e rendimentos da aplicação** (R$ 14,93 mi), **8 acessórios ou insumos** e **2 textos com mais de um equipamento**.

Padrões de erro, todos corrigíveis por regra explícita:

1. **Tipo de lançamento ignorado.** Rendimento e complemento foram contados como equipamento; acessórios de PET (armazenamento de rejeitos, anteparo, calibrador de dose), negatoscópio, lavadora e estação de planejamento foram contados como o equipamento principal.
2. **"Vídeo Endoscópio" sem "rígida"** é endoscópio flexível com CCD (a rígida usa ótica e câmera): código `011268`. Eu mandava para rígida.
3. **Tomógrafo sem olhar os canais ou cortes:** 32 e 64 canais ficam **fora** da família "até 16 canais" (`011805` e extintos); sem número de canais, **verificar**.
4. **Ressonância sem olhar a potência:** 0,5 T, 1,5 T e 3,0 T são três códigos (`010891`, `010889`, `010890`).
5. **Acelerador:** 011806 por padrão; 011807 só com IGRT kV ou CBCT no texto. A revisão corrigiu uma indicação anterior que mandava 011807 sem evidência.
6. **Ultrassom:** oftalmológico, transesofágico, odontológico e transcraniano têm código próprio e ficam fora de `011422`.
7. **Valor como critério:** a "pista" por valor mais próximo errou em mais de um terço; vale só como **confirmação**, com correção por IPCA (itens em reais) ou dólar médio (itens dolarizados, como acelerador e braquiterapia).

## 2. Conceitos

**Tipo de lançamento** (novo, vale para todo item do plano):

| Tipo | Significado | Conta como unidade? | Entra no valor do equipamento? |
|---|---|---|---|
| `aquisicao` | compra do equipamento | **sim** (quantidade do item) | sim |
| `rendimento_aplicacao` | uso do rendimento da aplicação financeira, complementação de valor, variação cambial, contrapartida financeira, quitação do equipamento | **não** | **não soma ao item**; aparece como "rendimento" ligado ao principal |
| `acessorio_insumo` | acessório, insumo ou infraestrutura do serviço (radioproteção de PET, negatoscópio, lavadora, estação de planejamento, kit de radiocirurgia) | não | fica fora da família do equipamento |
| `multiplo` | um texto que descreve mais de um equipamento, ou um rendimento rateado entre bens | não, até ser separado | pendente de rateio |
| `nao_equipamento` | obra, serviço, treinamento, narrativa | não | não |

**Decisão do usuário (23/10):** esses lançamentos ficam como **"rendimento da aplicação"** (nome oficial do tipo `rendimento_aplicacao`). A revisão classifica **37** das 77 linhas assim; a leitura de "esses 77 itens" precisa de confirmação (ver seção 9).

**Regra 1 (da revisão): rendimento não soma unidade e herda o código do item principal do mesmo convênio.** Isso resolve sem inferência casos como a RM do convênio 877501 e o tomógrafo do 766000. Quando o convênio tem mais de um item principal (por exemplo o 768433, com cama hospitalar, vídeo endoscopia e gama câmara), o rendimento fica **"rateio a definir"**, sem herdar.

**Regra 2 (da revisão): comparação de valor só para aquisição inteira**, corrigida por IPCA até mar/2026 (itens em reais) ou dólar médio do ano (itens dolarizados). A calibração dos tomógrafos de 32 e 64 canais e do PET (+5%, −3%, −11%) confirmou o método. **O valor confirma ou rebaixa a confiança; nunca escolhe o código.**

## 3. O classificador em camadas (explicável)

Cada item passa pelas camadas em ordem; a **primeira que decide** grava o resultado, o motivo e a confiança. Nada é decidido por palavra solta fora destas regras.

0. **Exclusão:** obra e serviço (`TIPO_DESPESA_ITEM`), como no PR #38.
1. **Tipo de lançamento por texto**, com padrões fechados e testados:
   - *rendimento_aplicacao:* `rendimento(s) de aplicação`, `complementação`, `complementar (o) valor`, `variação cambial`, `contrapartida financeira`, `quitação`, `uso do rendimento`;
   - *acessório_insumo:* lista fechada de termos de apoio (`armazenamento de rejeitos`, `anteparo`, `calibrador de dose`, `negatoscópio`, `lavadora`, `workstation de planejamento`, `kit de radiocirurgia`);
   - *multiplo:* regra da etapa 1 (dois códigos separados por `+`, ou `+` entre nomes curtos).
2. **Código no texto** (RENEM, legado ou local) e **nome exato** ou começando pela família: como já implementado.
3. **Regras de especificação por família**, só quando a família já é conhecida pelo texto:

   | Família | Regra |
   |---|---|
   | Vídeo Endoscopia | "Vídeo Endoscópio" sem "rígida/rigido" → flexível (`011268`), confiança média |
   | Tomógrafo | até 16 canais ou cortes → `011804`; 32 e 64 → `011805` e extintos, **fora**; sem nº de canais → **verificar** |
   | Ressonância | 0,5 T → `010891`; 1,5 T → `010889`; 3,0 T → `010890`; sem potência → **verificar** |
   | Acelerador | `011806`; `011807` só com IGRT kV ou CBCT explícitos |
   | Ultrassom | oftalmológico, transesofágico, odontológico, transcraniano → fora; doppler, cardio e diagnóstico → `011422` |
   | Gama câmara e PET | "câmara de cintilação gama" → `000595`; "emissão de pósitrons" → `000301` |
4. **Confirmação por valor** (IPCA ou dólar contra a RENEM): marca `coerente`, `fora da faixa` ou `verificar`; só rebaixa confiança. Itens "verificar" da revisão (acelerador de R$ 203 mil, gama câmara de R$ 131 mil) ficam na fila.
5. **Herança do rendimento** (regra 1).

**Estados do resultado:** `automatica_alta` (aplicada), `a_revisar` (média, baixa, "verificar", rateio), e `decidida_pela_equipe` (decisão humana, que sempre prevalece sobre a regra e não é sobrescrita por reprocessamento).

## 4. Gabarito e métricas de aceite

A revisão vira **conjunto de teste permanente**: as 77 linhas "sem código", as 17 "com código" e as 17 de "multi-equipamento" (aba "Multi-equipamento", que já separa o `CR + Impressora Dry`). O motor só é aceito quando, contra o gabarito:

- **tipo de lançamento acertado em 95% ou mais;**
- **família e código corretos em 95% ou mais dos itens que o motor aplica sozinho (`automatica_alta`)**, e **zero falso positivo** entre eles; o que for duvidoso vai para `a_revisar`, nunca é aplicado;
- toda linha que a revisão marcou "verificar" **não** é aplicada sozinha.

O relatório de aderência sai por camada e por categoria de erro, e roda no CI como teste (sem banco).

## 5. Modelo de dados (aditivo)

- **`decisao_classificacao_item`** (append-only, no padrão de `EventoMarco`): `convenio_id`, `chave_item` (`ID_ITEM_PAD` ou hash da descrição quando não há ID), `tipo_lancamento`, `codigo_item` NULL, `familia` NULL, `conta_unidade`, `item_principal_chave` NULL, `confianca`, `origem` (`regra` | `revisao_equipe`), `referencia` (por exemplo `revisao_codigos_RENEM_v2.xlsx#linha 31`), `versao_regra`, `autor_id` NULL, `observacao`, `criado_em`, `substituida_por_id`. A decisão da equipe substitui a da regra sem apagá-la.
- **`item_plano`** (etapa 2 do plano dos itens) ganha `tipo_lancamento`, `item_principal_id FK NULL` (rendimento aponta para o item principal) e `situacao_classificacao`.
- **`codigo_item_legado`** ganha `equivalente_renem` NULL: a aba "Demais – achados" lista **códigos extintos com equivalente** (por exemplo `010544` Ventilador → `011425`; `001270` Laringoscópio → `011248`/`011249`; `000142` Nefroscópio → `000547`). Entram como equivalência explícita, não como inferência.

## 6. Carga da revisão e correções de dado

- Script idempotente `scripts/importar_revisao_classificacao.py` (simulação por padrão, `--aplicar --confirmo-host`): lê as abas e grava as decisões com origem `revisao_equipe`. As 11 linhas "AJUSTE" entram com o código ajustado; as 6 "VERIFICAR" entram como **pendentes na fila**, com a observação, não como decisão.
- **Duplicidade a corrigir na minha planilha:** `000173` e `011423` apareciam em duas abas e podiam ser somados duas vezes.
- **Itens para conferir no SICONV** (da revisão): linhas 17 e 76 (canais do tomógrafo), 21 (acelerador de R$ 203 mil), 32 (gama câmara de R$ 131 mil), 49 (4 gama câmaras), 50 a 52 (convênio 792992, ≈ US$ 2,74 mi), 73 (+220%), e os convênios 731380, 753902 e 778082 depois de saírem da aba multi.
- **Escopo:** tomógrafo acima de 16 canais fica **fora** (≈ R$ 15,3 mi neste arquivo; decisão de coordenação).

## 7. Tela e relatórios

- A tabela de equipamentos do instrumento mostra o **rendimento como linha filha** do equipamento principal ("Rendimento da aplicação: R$ X; não soma unidade"), com a origem (regra ou equipe).
- **Fila de revisão** (gestor e admin): itens `a_revisar`, com o texto completo, a sugestão da regra e o motivo, o valor corrigido contra a RENEM e a ação "confirmar", "corrigir" ou "não é equipamento". Cada ação grava uma decisão da equipe.
- **Relatórios:** quantidade soma só `aquisicao`; o valor do equipamento mostra "aquisição" e "rendimento" separados, e o total como soma explícita; nenhum rendimento vira unidade.

## 8. Entrega

| Etapa | Conteúdo | Aceite |
|---|---|---|
| C1 | Gabarito no repositório e harness de métricas (teste sem banco) | relatório de aderência reproduzível |
| C2 | Camada de tipo de lançamento e regras de especificação | metas da seção 4 atingidas |
| C3 | Tabela de decisões, importador da revisão e códigos equivalentes | simulação confere com a revisão; idempotente |
| C4 | Fila de revisão e linha filha de rendimento na tela | fluxo e2e |
| C5 | Relatórios com aquisição e rendimento separados | regressão dos relatórios |

C1 a C3 são pré-requisito da projeção de itens (etapa 3 do plano dos itens). Tudo em commits locais, sem envio ao remoto até a sua autorização.

## 9. Decisões do usuário (23/10, respostas à primeira versão)

1. **Os 77 itens:** ficam como rendimento da aplicação **só se realmente forem**; o usuário prefere a avaliação do sistema. Vale a regra por evidência da seção 3 (a revisão aponta 37), e não uma troca em bloco. A fonte oficial de solicitações de rendimento (seção 10) passa a ser a evidência mais forte.
2. **Valor do equipamento é mais complexo do que parecia:** o valor registrado no plano **não é exatamente** o que consta no pagamento ao fornecedor. Precisa de avaliação própria (seção 10).
3. **Rateio de rendimento entre bens:** **fora de escopo.** "O que vale para a gente é o valor do item e o valor pago ao fornecedor através da nota fiscal." Para os instrumentos da API, o valor a usar deve ser **o valor pago ao fornecedor, se for possível vincular o item ao pagamento.**
4. **Acessórios:** ficam **sem família** (e sem unidade).
5. **"Famílias visíveis (12)":** esclarecido abaixo.

**Sobre a pergunta 5:** a coluna "Nas famílias visíveis?" e a frase "faltam 4, e 011268 não está entre as visíveis" da revisão vêm de uma limitação da **minha** planilha, e não de uma tela: a minha função de "família sugerida" só conseguia sugerir 12 das 16 famílias (todo "endoscópio" ia para vídeo endoscopia rígida; faltavam Vídeo Endoscopia Flexível, Endoscópio Rígido, Endoscópio Flexível e Cirurgia Robótica). É o mesmo defeito do item 2 da seção 1, e as regras por família da seção 3 o corrigem. Nenhuma tela precisa de ajuste.

## 10. Valor do equipamento: item do plano × pago ao fornecedor

**O que o sistema guarda hoje (medido na cópia de 17/10):**

- **Plano de aplicação** (`siconv_plano_aplicacao_detalhado`): valor unitário e total por item. É o **planejado**.
- **Pagamentos** (`siconv_pagamento`): 1.601 pagamentos em 291 convênios, cada um com `ID_DL`, `NR_DL`, tipo do documento fiscal (`DESC_DL`, por exemplo "INVOICE - DOCUMENTO FISCAL DE IMPORTAÇÃO"), fornecedor, CNPJ, valor pago e data. **Não trazem o item comprado.**
- **Nada hoje liga um pagamento a um item do plano.**

**O que a fonte oficial publica e ainda não usamos** (lista de arquivos do Transferegov, atualizada em 23/10/2026):

| Arquivo | Tamanho | Serve para |
|---|---:|---|
| `siconv_itens_dl.zip` | 520 MB | itens do **documento de liquidação** (a nota), com descrição e valor: o elo entre pagamento e equipamento (o `itens_dl` que o usuário mencionou) |
| `siconv_dl.zip` | 205 MB | o documento de liquidação em si (tipo, número, emissão), para ligar `ID_DL` do pagamento aos itens |
| `siconv_solicitacao_rendimento_aplicacao.zip` | 0,3 MB | **registro oficial das solicitações de rendimento da aplicação**: prova de que um lançamento é rendimento, sem depender do texto |
| `siconv_itens_licitacao.zip` | 222 MB | itens da licitação (outra pista do preço contratado) |

**Cadeia de vínculo a investigar:** `pagamento.ID_DL` → `DL` → `itens_dl` (descrição e valor do que a nota faturou) → item do plano (por identificador, se o arquivo trouxer; senão por convênio e descrição, com conferência de valor, sempre como **vínculo sugerido** até ser provado).

**Estados do valor de cada item:** `valor_planejado` (plano), `valor_nota` (soma dos itens de DL ligados), `valor_pago` (pagamentos ao fornecedor ligados) e `situacao_vinculo` (`vinculado_por_id`, `vinculado_por_descricao_e_valor`, `nao_vinculado`, `parcial`). Relatórios e painel passam a mostrar **planejado e pago lado a lado**; o **pago** prevalece como "valor do equipamento" **somente quando o vínculo existe**; sem vínculo, o valor continua o planejado, rotulado como tal.

**Avaliação antes de decidir (etapa V1, sem alterar o sistema):**
1. Baixar os arquivos acima para uma pasta temporária **fora do repositório**, filtrar pelos nossos 560 convênios e **descartar o bruto**.
2. Medir cobertura: quantos pagamentos têm `itens_dl`; quantos itens do plano das 16 famílias ligam a um item de nota; quanto do valor planejado bate com o pago; onde divergem (câmbio, nota de importação, parcelas, desconto, impostos).
3. Medir quantas solicitações de rendimento oficiais correspondem aos 37 lançamentos da revisão (e se há outros que o texto não pegou).
4. Entregar relatório de aderência e a **proposta de regra do valor** para o usuário aprovar.

**Para instrumentos fora da API** (PERSUS, FAF, TED, PRONON): o valor pago vem de `pagamento_obra_persus` e das planilhas da equipe, fora da cadeia SICONV; entram em fase posterior, com a mesma ideia de "planejado × pago".

**Fora de escopo, por decisão:** rateio de rendimento entre bens; qualquer valor inventado para completar item sem pagamento.

## 11. Resultados medidos (2026-10-23)

**Motor de descrição (`backend/app/classificacao_itens.py`)** contra o gabarito revisado de 77 itens: tipo de lançamento 75/77 (97%); família e código 26/26 (100%) nas aquisições decididas. Os dois erros restantes não se resolvem por texto: a linha 14 (software de neuronavegação, aquisição fora das 16 famílias) e a linha 39 (ultrassom cujo texto é igual ao de uma compra; só a revisão humana ou o valor distingue). Esses casos entram na fila de revisão, nunca em aplicação automática.

**Vínculo item do plano × item do documento de liquidação (etapa V1).** Filtrados 403 propostas, 1.731 documentos de liquidação e 2.029 itens de liquidação dos nossos convênios. Dos 426 itens de família controlada, 349 (82%) têm algum item de liquidação compatível por valor (±20%) ou por nome (304 por valor, 325 por nome). Os 77 sem par aparecem em convênios sem liquidação lançada do equipamento ou com nome diferente (ex.: acelerador com texto distinto). O vínculo é uma sugestão a confirmar, não regra automática; o valor pago ao fornecedor só substitui o planejado quando o vínculo é confirmado.
