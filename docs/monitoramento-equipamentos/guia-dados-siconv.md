# Guia de dados — SICONV (monitoramento de equipamentos oncológicos)

Espelho do que o dump nacional do SICONV legado realmente oferece pro
monitoramento de equipamentos oncológicos: quais tabelas usamos, quais
conhecemos mas ainda não usamos, e as pegadinhas já resolvidas. Não é
metodologia de cálculo (isso é `docs/metodologia-parametros.md`) — é sobre
proveniência e estrutura do dado de convênio/equipamento.

Fonte: dump bulk `https://repositorio.dados.gov.br/seges/detru/` (SICONV —
Sistema de Gestão de Convênios e Contratos de Repasse, Ministério da
Gestão), recorte público, ~44 tabelas / 8GB+ no total. Ver
`backend/scripts/coletar_siconv_legado.py` e
`backend/scripts/levantamento_convenios_oncologia.py`.

## Duas fontes, dois propósitos

- **`coletar_siconv_legado.py`** — pega o detalhe completo (empenho,
  desembolso, licitação, termo aditivo, item de plano, programa) só dos
  convênios que já passaram pela triagem manual/validação da equipe
  (`scripts/output/convenios_flat.json`). Roda rápido porque filtra por um
  conjunto pequeno e conhecido de `NR_CONVENIO`.
- **`levantamento_convenios_oncologia.py`** — varre o dump NACIONAL inteiro
  (todos os convênios do Brasil, não só os já conhecidos) procurando por
  padrão de equipamento/componente. É a ferramenta de descoberta, não de
  detalhe — usada quando a pergunta é "quais convênios eu ainda não
  conheço?".

## Tabelas que já usamos (confirmadas no nosso código)

| Tabela | Papel no pipeline | Chave | Onde |
|---|---|---|---|
| `siconv_convenio` | 1 linha/convênio — situação, valores agregados, saldo em conta, `ANO` | `NR_CONVENIO` | ambos scripts |
| `siconv_empenho` | N/convênio — empenhos | `NR_CONVENIO` | `coletar_siconv_legado.py` |
| `siconv_desembolso` | N/convênio — cada repasse liberado | `NR_CONVENIO` | `coletar_siconv_legado.py` |
| `siconv_licitacao` | N/convênio — modalidade, valor, status da licitação | `NR_CONVENIO` | `coletar_siconv_legado.py` |
| `siconv_termo_aditivo` | N/convênio — alterações de valor/prazo | `NR_CONVENIO` | `coletar_siconv_legado.py` |
| `siconv_plano_aplicacao` | item a item do que foi **planejado** comprar (`DESCRICAO_ITEM`) — o zip se chama `siconv_plano_aplicacao.csv.zip` mas o CSV de dentro é `siconv_plano_aplicacao_detalhado.csv` (mesmo arquivo que a literatura externa chama de "Plano de Aplicação Detalhado", ~4,65 milhões de linha) | `ID_PROPOSTA` | ambos scripts — fonte central da varredura de equipamento |
| `siconv_programa_proposta` | 1 linha por (`ID_PROPOSTA`, `ID_PROGRAMA`) — só a ponte | `ID_PROPOSTA` → `ID_PROGRAMA` | ambos — achado 2026-09-08 |
| `siconv_programa` | catálogo `ID_PROGRAMA` → `NOME_PROGRAMA` (~1,25 milhão de linha, governo federal inteiro, não só Saúde) | `ID_PROGRAMA` | ambos — achado 2026-09-08 |

`siconv_programa`/`siconv_programa_proposta` dão o **Programa** de cada
convênio de forma EXATA por `ID_PROPOSTA` — não é aproximação por CNPJ como
o cruzamento com o TransfereGov novo (`transferegov_relacional`). É a fonte
preferida pro campo "Programa" e pro casamento com os 8 "componente" da
Política Nacional de Prevenção e Controle do Câncer (ver `COMPONENTES_ALVO`
em `levantamento_convenios_oncologia.py`).

> [!warning] Custo de varrer `siconv_programa.csv` nacional
> É 1,25 milhão de linha — rodar fuzzy-match (`SequenceMatcher`) em cada uma
> é caro (medido: não terminou em 9min). `levantar_componente_siconv()`
> pré-filtra por substring barata (`ONCOL`/`CANCER`/`PRONON`/`PRONAS`) antes
> do fuzzy match — só ~18 mil linhas sobrevivem ao pré-filtro.

> [!warning] Universo do app: só convênio ASSINADO (Portal), decisão 2026-09-09
> Entre 2026-09-08 e 2026-09-09 o pipeline chegou a incluir também convênio
> achado só no dump SICONV sem entrada no Portal da Transparência
> (`siconv_proposta.csv` como fallback de identidade — `NM_PROPONENTE`,
> `OBJETO_PROPOSTA`, `MODALIDADE`, `SIT_PROPOSTA`, `VL_GLOBAL_PROP`, campo
> `identidadeFonte` no front). Conferido: **38 dos 41** desses casos ainda
> estavam em fase de `SIT_PROPOSTA` "Proposta/Plano de Trabalho Aprovado"
> (2 rejeitados, 1 em análise) — nenhum tinha `SIT_CONVENIO`, ou seja,
> nenhum era convênio formalizado de verdade. Revertido a pedido do
> usuário: **"Vamos manter apenas o que está no portal mesmo. Convênios
> assinados."** `coletar_siconv_legado.py` voltou a usar só
> `convenios_flat.json` como universo; `siconv_proposta.csv` não é mais
> buscado (volta pra tabela "conhecida mas não usada" abaixo). De quebra,
> a hipótese de que `MODALIDADE` daria TED/PERSUS/FAF pro filtro "Tipo de
> contratação" foi testada nos 41 casos e **descartada** — só apareceu
> `CONVENIO`/`CONTRATO DE REPASSE`.

## Tabelas conhecidas mas AINDA NÃO usadas no nosso pipeline

Citadas num guia de um projeto anterior do usuário sobre o mesmo dump — não
verificadas ainda contra o nosso código, mas o nome de arquivo
`siconv_plano_aplicacao_detalhado.csv` bateu exato com o que já confirmamos
existir dentro do nosso `siconv_plano_aplicacao.csv.zip`, o que dá confiança
de que vêm do mesmo dump e devem estar disponíveis em
`{BASE_URL}/{nome}.csv.zip` do mesmo jeito.

| Tabela | O que tem | Por que pode interessar |
|---|---|---|
| `siconv_meta_crono_fisico` (~1,50 milhão de linha) | `NOME_PROGRAMA`, `DESC_META`, `UF_META` — por `ID_PROPOSTA` | pode servir de reforço/nível-2 na varredura de componente (contexto do programa mesmo quando a descrição do item não é clara), mas hoje já cobrimos isso melhor via `siconv_programa` (exato, não texto livre) |
| `siconv_itens_dl` (~9,27 milhões de linha) | o que foi **efetivamente pago** (`DESCRICAO_ITEM_DL`, `VALOR_TOTAL_ITEM_DL`) — pode divergir do planejado (nome comercial vs. técnico) | hoje só usamos `siconv_plano_aplicacao` (planejado) pra identificar equipamento — nunca cruzamos com o que foi de fato pago |
| `siconv_pagamento` (~6,94 milhões de linha) | `NOME_FORNECEDOR`, `IDENTIF_FORNECEDOR`, `DATA_PAG`, `VL_PAGO`, por `NR_CONVENIO` | identificaria o fornecedor/fabricante que efetivamente recebeu o pagamento — não temos isso hoje |
| `siconv_emenda` (~284 mil linha) | emenda parlamentar vinculada ao convênio | fora de escopo até pedido específico |
| `siconv_contrato` (~656 mil linha) | contratos firmados a partir da licitação | fora de escopo até pedido específico |
| `siconv_etapa_crono_fisico` (~3,1 milhões de linha) | detalhamento de etapa dentro de cada meta | fora de escopo |
| `siconv_historico_situacao` (~8,3 milhões de linha) | linha do tempo de mudança de status por convênio | poderia alimentar um "histórico" no card, hoje só mostramos o status atual |
| `siconv_justificativas_proposta` (~1,1 milhão de linha) | texto livre de justificativa da proposta | fora de escopo |

> [!warning] A confirmar
> Nenhuma dessas 6 tabelas foi baixada/inspecionada ainda pelo nosso
> código — os nomes de coluna acima vêm só do guia externo, não de um
> `cabecalho.index(...)` real contra o CSV. Antes de codar em cima de
> qualquer uma, baixar o zip e conferir o cabeçalho de verdade (mesmo
> padrão de `_baixar_zip_siconv` + `_linhas_csv_do_zip`) — `siconv_proposta`
> já passou por essa checagem (ver tabela "já usamos" acima) e o cabeçalho
> real bateu com o do guia, o que dá confiança nos nomes das outras 6, mas
> não é garantia.

## Planejado vs. executado — distinção que hoje não fazemos

O dump registra dois momentos da vida de um convênio que podem divergir:

- **Planejado**: o que o proponente declarou que ia comprar
  (`siconv_plano_aplicacao` / `DESCRICAO_ITEM`) — é a ÚNICA fonte que
  usamos hoje pra identificar equipamento (`equipamentoTags.ts` no front,
  `PADROES_EQUIPAMENTO` no levantamento).
- **Executado**: o que foi de fato pago depois da licitação
  (`siconv_itens_dl` + `siconv_pagamento`, tabela não usada — ver acima).
  A descrição pode vir diferente (nome comercial do equipamento em vez do
  nome técnico genérico).

Não tentamos cruzar os dois ainda. Um convênio "Em execução" no
`SIT_CONVENIO` com item planejado de equipamento pode não ter comprado nada
de fato ainda — o card hoje não distingue isso.

## Pegadinhas de parsing já resolvidas

- **Nome do zip ≠ nome do CSV dentro**: `siconv_plano_aplicacao.csv.zip`
  contém `siconv_plano_aplicacao_detalhado.csv` — nunca assumir nome, pegar
  sempre o primeiro (e único) membro do zip.
- **`siconv_termo_aditivo.csv`**: `JUSTIFICATIVA_TA` é o último campo, texto
  livre sem aspas, às vezes com `;` interno — quebra split ingênuo. Corrigido
  com split de N-1 cortes, sobrando o resto no último campo.
- **`siconv_programa.csv`**: linha duplicada por região/UF pro mesmo
  `ID_PROGRAMA` (mesmo `NOME_PROGRAMA` repetido) — usar só a 1ª ocorrência.
- **Valores como texto**: campos de valor (`VL_GLOBAL_CONV`,
  `VALOR_TOTAL_ITEM` etc.) vêm como string no CSV — nunca comparar/somar
  sem conversão explícita.
- **`NR_CONVENIO` às vezes não é numérico**: formato novo de instrumento
  (ex. `7AACVL`) mistura letra e número — nunca tratar como int/BIGINT sem
  checar.
- **Busca por texto sem normalização de acento**: o CSV vem com acento; se
  o termo de busca não cobrir a variação acentuada/não-acentuada, perde
  match. Resolvido normalizando (NFD + remove combining marks) os dois
  lados antes de comparar — ver `_normalizar()`.

## Como as tabelas se conectam (só as que usamos)

```
siconv_plano_aplicacao (item planejado, DESCRICAO_ITEM)
    │
    └── ID_PROPOSTA ──► siconv_convenio (NR_CONVENIO, situação, ANO)
                              │
                              ├── NR_CONVENIO ──► siconv_empenho / siconv_desembolso /
                              │                    siconv_licitacao / siconv_termo_aditivo
                              │
                              ├── ID_PROPOSTA ──► siconv_programa_proposta ──► siconv_programa
                              │                     (ID_PROGRAMA)              (NOME_PROGRAMA)
                              │
                              └── ID_PROPOSTA ──► siconv_proposta (NM_PROPONENTE, OBJETO_PROPOSTA...)
                                                    -- só buscada quando falta no Portal
```
