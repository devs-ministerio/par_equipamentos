# Decan Equipamentos — documento de contexto

**Projeto:** DECAN/MS — Departamento de Atenção ao Câncer
**Responsável:** Gustavo
**Status:** protótipo em desenvolvimento, dados fictícios

---

## 1. O que é o projeto

O DECAN recebe propostas de investimento em equipamentos oncológicos — via emendas parlamentares e via orçamento próprio — para ampliar a oferta de equipamentos do SUS. Hoje, assessores consultam uma planilha para saber se um município, UF ou macrorregião de saúde está em déficit ou superávit de determinado equipamento.

O objetivo do "Decan Equipamentos" é profissionalizar esse processo: transformar a planilha em uma ferramenta com mapa, indicadores e um "cardápio" de consulta, para que tanto a equipe técnica quanto parlamentares e outros atores interessados consigam identificar os locais mais aptos a receber um equipamento.

Equipamentos cobertos: **acelerador linear, tomógrafo, PET-CT, ultrassom, mamógrafo, ressonância magnética.**

O protótipo original (planilha de critérios) foi desenvolvido por outro membro da equipe do DECAN. Gustavo está enriquecendo o projeto, com apoio de Claude atuando como consultor sênior de produto/dados.

---

## 2. Avaliação da planilha original (ponto de partida)

**Nota atribuída: 5,5/10.**

Pontos fortes:
- Lógica de cálculo amarrada a fontes primárias oficiais (CNES/DATASUS, IBGE, INCA), não a estimativas arbitrárias.
- Parâmetros sensíveis a nuances reais (ex.: exigência de gama-câmara e distância máxima do fornecedor de radiofármaco para viabilizar um PET-CT).
- Parâmetro de mamografia bem estratificado por faixa etária e tipo de indicação.

Fragilidades identificadas:
1. Não é um sistema — é uma planilha com links fixos para telas do CNES2, sem API, versionamento ou automação.
2. Métrica de oferta pura (equipamento por população/casos), sem cruzamento com produção real (SIA/SUS, SISCAN) — não captura subutilização ou equipamento sucateado.
3. Ultrassom e ressonância usam parâmetros assistenciais gerais, não recortes oncológicos — inconsistente com a proposta de "cardápio oncológico".
4. Fuga de pacientes entre regiões era tratada como checagem manual ("ponto de atenção"), não como indicador.
5. **Achado factual concreto:** a estimativa do INCA usada como base já estava desatualizada no momento da análise — ver seção 4.
6. Parâmetros sem rastreabilidade normativa explícita (ver seção 4).

---

## 3. Índice de Dependência Regional (IDR) — Oncologia

**Correção de 06/08/2026:** o IDR **não é um conceito desta consultoria** — é um indicador oficial já publicado no painel SAGE do Ministério da Saúde. Achado ao estudar o painel a pedido do Gustavo (ver seção 9.3 para a metodologia oficial completa). O que fica valendo desta seção original é que a definição que tínhamos chegado por conta própria estava **direcionalmente correta** (fuga de paciente = atendimento fora do território / total consumido), só que menos granular que a oficial — mantido abaixo como registro histórico de como chegamos lá, mas **a partir de agora a referência é a metodologia oficial do SAGE, seção 9.3.**

**Definição original (nossa, pré-descoberta do SAGE):** mede o quanto os pacientes residentes numa região dependem de estabelecimentos fora dela para tratamento oncológico.

```
IDR (região X) = Procedimentos oncológicos de residentes de X realizados FORA de X
                  ÷ Total de procedimentos oncológicos consumidos por residentes de X
```

- Varia de 0 (região autossuficiente) a 1 (totalmente dependente de fora).
- Calculável por modalidade (radioterapia, quimioterapia, imagem), por nível geográfico (município → macrorregião → UF) e por período.
- **Fonte de dados:** SIA/SUS e SIH/SUS, cruzando o município de residência do paciente com o CNES do estabelecimento executante — a mesma lógica clássica de "análise de fuga de pacientes" já usada em Planos Diretores de Regionalização (PDR) e na Programação Pactuada e Integrada (PPI).

**Uso recomendado — matriz de priorização (déficit × IDR):**

| | IDR baixo | IDR alto |
|---|---|---|
| **Déficit baixo** | Baixa prioridade | Investigar causa (acesso, qualidade, fila) |
| **Déficit alto** | Déficit resolvido localmente — investigar capacidade ociosa | **Prioridade máxima de investimento** |

---

## 4. Achados normativos e factuais

- **INCA — Estimativa 2026-2028:** divulgada em 04/02/2026, aponta 781 mil novos casos de câncer/ano no Brasil, um aumento de aproximadamente 10,9% em relação aos 704 mil/ano estimados para o triênio 2023-2025. Isso desatualiza qualquer cálculo de déficit de acelerador linear baseado na estimativa anterior — **ação recomendada: confirmar que a base de casos novos usada no sistema já reflete este triênio.**
- **Origem provável dos parâmetros de cobertura** (tomógrafo 1/100 mil hab., PET-CT 1/1,5 mi hab., ultrassom 150/1.000 hab/ano etc.): parecem derivar da Portaria GM/MS nº 1.631/2015 (Critérios e Parâmetros para o Planejamento e Programação de Ações e Serviços de Saúde no SUS), consolidada no Caderno 1 de Critérios e Parâmetros Assistenciais SUS (2017). A própria portaria prevê revisão periódica pela SAS — **ação recomendada: confirmar com SAS/SECTICS se os parâmetros seguem vigentes antes de embuti-los como referência oficial no sistema.**
- **Fronteiras de macrorregião de saúde:** não estão disponíveis via API pública. O portal do MS indicado por Gustavo (infoms.saude.gov.br) bloqueia acesso direto/scraping. Para um mapa de macrorregião com fronteiras oficiais, será necessário exportar o shapefile/geojson diretamente da fonte (ou solicitar à equipe de TI do MS).

---

## 5. Arquitetura proposta do sistema (4 telas)

Baseada nos rascunhos manuscritos de Gustavo.

### 5.1 Painel geral
- Toggle **Estados** / **Macrorregiões**.
- Mapa clicável; ao selecionar uma região, abre painel à direita com total de equipamentos por tipo.
- Cards de indicador: total de municípios, IDR médio, estimativa de casos novos (CNC-SUS).
- Mapa de recorte (zoom na UF/macro selecionada).
- Filtros: equipamento, município, comparação entre regiões.

### 5.2 Equipamentos
Detalhe por tipo de equipamento, organizado em 3 blocos:
- **Oferta:** mapa dos equipamentos na região, lista de CNES habilitados, distância média entre equipamentos, parâmetro vigente.
- **Necessidade:** déficit/superávit por IDR, déficit/superávit por casos novos, população SUS coberta, barra de cobertura da necessidade.
- **Desempenho:** pacientes por equipamento/ano, produção média (SIA/SIH), população total por equipamento, habilitação regulatória em oncologia por estabelecimento.

### 5.3 Municípios
- Mapa com todos os municípios da macrorregião.
- Total de equipamentos, total de estabelecimentos (habilitados ou não), para onde os pacientes têm sido encaminhados (mesma base de dados do IDR), distância média percorrida.

### 5.4 Catálogo de déficit ("cardápio")
- Mostra apenas equipamentos em déficit.
- Drill-down: equipamento em déficit → UFs/macrorregiões sugeridas → município → estabelecimentos.
- Público-alvo: assessores e parlamentares avaliando propostas de investimento.

---

## 6. Fragilidades a resolver antes da versão real

1. **Critério de "sugestão" no catálogo de déficit não está definido** — hoje ordenado por IDR decrescente no protótipo, mas isso é uma escolha a validar com a equipe (poderia ser por distância, população desassistida, ou uma combinação).
2. **Falta indicação de viabilidade** no catálogo — custo, prazo, status de habilitação em andamento. Sem isso, o catálogo é uma lista de candidatos, não uma ferramenta de decisão.
3. **Déficit por IDR x déficit por casos novos podem divergir** — o sistema precisa de uma regra de desempate ou explicação visível, ou o usuário vai interpretar a divergência como erro.
4. **Risco de cálculo duplicado:** o dado de "para onde os pacientes são encaminhados" (tela de município) é a mesma base bruta do IDR (tela geral) — se implementados como duas queries separadas, os números podem divergir com o tempo.
5. **Recomendação estrutural:** desenhar um schema único de dados (município → estabelecimento → equipamento → produção) do qual todas as telas fazem apenas recortes, em vez de cada tela reimplementar sua própria versão dos cálculos de déficit/IDR/distância.
6. **"IDR médio (ponderado)"** — no protótipo atual é um valor fictício independente, não uma média real ponderada por população dos municípios da região. O rótulo promete um cálculo que ainda não existe; importante deixar isso explícito na especificação para o dev não implementar como média simples.

---

## 7. Entregáveis já produzidos

- **Protótipo interativo HTML** (`decan-prototipo.html`) — arquivo único, sem instalação, dados fictícios.
  - Mapa por UF com geometria real (API de malhas do IBGE, 26 estados + DF).
  - Mapa por macrorregião com municípios reais da Bahia e Pernambuco (únicos estados com dados fictícios no protótipo) sobre o contorno real dos dois estados.
  - As 4 telas do desenho de Gustavo implementadas e navegáveis.

## 8. Próximos passos em aberto

- Buscar dados reais (CNES, SIA/SUS, SIH/SUS, INCA) para substituir os dados fictícios — **acelerador linear já feito, ver seção 9.**
- Confirmar vigência dos parâmetros da Portaria GM/MS nº 1.631/2015 com SAS/SECTICS.
- Definir critério de ordenação/sugestão no catálogo de déficit.
- ~~Obter fronteiras oficiais de macrorregião de saúde (shapefile/geojson) junto ao MS.~~ **Feito para a Bahia em 06/08/2026, ver seção 9.4** — falta só integrar no protótipo.
- Desenhar o schema único de dados antes de repassar a especificação ao dev.

---

## 9. Bugs de UX corrigidos e primeira integração de dado real (06/08/2026)

### 9.1 Bugs corrigidos no protótipo HTML

Revisão sênior encontrou e corrigiu 5 bugs de wiring no `decan-prototipo_1.html` (detalhe técnico na memória do agente, não repetido aqui): o filtro de equipamento no Painel Geral não afetava o mapa; a busca de município era um placeholder vazio; "Comparar com outra região" era decorativo; o card de IDR e o chip da mesma UF podiam mostrar valores diferentes em modo "Estados" (dois cálculos desconectados pro mesmo dado); e navegar pra aba Equipamentos vindo do modo Estados sempre caía num fallback fixo mostrando Bahia/Salvador, não importa a UF selecionada. Todos corrigidos e validados com um harness automatizado antes da entrega.

### 9.2 Acelerador linear — primeira modalidade com dado real

Gustavo trouxe 3 documentos novos: `aceleradores_levantamento.xlsx` (levantamento manual real, 221 estabelecimentos, coluna `EM_OPERACAO` como fonte de verdade — pode ser menor que o autorizado em portaria), `avaliacao_radiofarmacos_pet_ct_sus.md` (análise real de PET-CT/radiofármacos) e confirmou que `equipamentos (2).xlsx` é extração real do CNES feita por ele.

Com isso, o **Acelerador Linear** passou a ser a primeira modalidade 100% real no protótipo:
- **Cobertura nacional (27 UFs)** no modo "Estados": déficit/atendido calculado com a regra já validada com a equipe do DECAN ("1 acelerador / 1.000 casos novos/ano"), casos novos agregados por UF a partir de `POPULACAO_CNC(POPULAÇÃO).csv` (coluna CNC_ESTIMADO_INCA).
- **Bahia e Pernambuco** (as duas UFs com macrorregião fictícia no protótipo) usam o mesmo dado real, mas recortado por município/macro — sem cálculo duplicado, a UF agrega a partir das macros.
- Aba Equipamentos mostra estabelecimentos reais (nome, CNES, quantos em operação) pra qualquer uma das 27 UFs, e um "painel administrativo" comparando portaria × monitorado × em operação.
- Os outros 5 equipamentos (tomógrafo, PET-CT, mamógrafo, ressonância, ultrassom) continuam fictícios e restritos a BA/PE — o protótipo agora é honesto sobre isso (disclaimer do topo e badges "dado real"/"dado fictício" foram atualizados).

**Atualização de 06/08/2026 — fórmula oficial confirmada por Gustavo:** o cálculo de déficit do acelerador linear usa **72% dos casos novos com indicação de radioterapia (CCORE/INCA) ÷ capacidade de 720 procedimentos/equipamento/ano**, conforme **Portaria GM/MS nº 8.516/2025** e parâmetro mínimo da **Portaria SAES/MS nº 688/2023** (substituindo a citação à Portaria 1.631/2015 usada nos outros equipamentos). Achado importante: essa fórmula é **matematicamente idêntica** à regra simples "1 equipamento / 1.000 casos novos" já usada em `parametros_desatualizados.xlsx` (0,72 × CNC ÷ 720 = CNC ÷ 1.000) — os números do protótipo não mudaram, só passaram a citar a portaria correta e vigente. Gustavo também confirmou que `POPULACAO_CNC(POPULAÇÃO).csv` é o estudo mais recente/atual dele — é a referência de casos novos daqui pra frente. A diferença entre a soma dessa base (~518 mil/ano) e a manchete do INCA pro triênio 2026-2028 (781 mil/ano) é esperada: estimativas municipais do INCA são modeladas por município/UF, não um rateio simples do total nacional — não é um erro de dado.

**Achado sobre os dados (útil pra futuras integrações):** em 25 dos 221 estabelecimentos do levantamento, o total autorizado (portaria + monitorado) é maior que o realmente em operação — evidência concreta da fragilidade "métrica de oferta não captura equipamento sucateado" já apontada na seção 2.

### 9.3 IDR oficial (painel SAGE) e decisão de usar a Bahia como piloto

Gustavo decidiu: **a Bahia vira o dado inicial/piloto do projeto** — próximas integrações de dado real priorizam BA antes de expandir pra outras UFs. E pediu pra estudar o painel oficial do SAGE/MS sobre IDR-Oncologia antes de implementar qualquer coisa:

`https://novasage.saude.gov.br/politicas-programas-projetos-estrategias-e-acoes/indice-de-dependencia-regional-idr-oncologia`

**Achado principal: o IDR não é um conceito desta consultoria — já existe oficialmente no SAGE/MS.** Isso corrige a seção 3 (mantida acima como registro histórico). Metodologia oficial (extraída da estrutura do painel — números não capturáveis via scraping simples porque o painel é um dashboard renderizado em JS, ver observação abaixo):

- **Definição oficial:** "proporção de atendimentos realizados fora do território de residência dos pacientes — seja em outra região de saúde ou macrorregião de saúde."
- **Duas dimensões de cálculo, com abas próprias no painel:**
  - **Atenção hospitalar** — internações com diagnóstico primário de câncer, CID **C00-C97** e **D37-D48**.
  - **Atenção ambulatorial** — procedimentos de **quimioterapia e radioterapia** em regime ambulatorial.
- Cada dimensão tem sub-abas "categorias" e **"distâncias"** — ou seja, o painel oficial já cruza fuga de paciente com distância percorrida, algo que nosso protótipo ainda trata como dado fictício solto (`distanciaMedia` em `municipioStats`).
- **Nível geográfico:** Região de Saúde e Macrorregião de Saúde (abas "IDR - Regiões de Saúde" e "IDR - Macrorregiões de Saúde") — **não** é município nem UF. "Região de Saúde" é um nível mais fino que macrorregião e que não existe na nossa estrutura fictícia atual (`DATA` no protótipo só tem macro → município, sem a camada intermediária região de saúde).
- Também tem aba "Estabelecimento de Saúde" (provavelmente drill-down até o CNES executante).
- Fonte de dados explícita (SIA/SIH/CNES) e valores numéricos de exemplo **não vieram no scraping** — o conteúdo é montado por JS/API no navegador, não está no HTML estático. Pra ter os números reais da Bahia, precisa ou (a) Gustavo exportar/printar do painel, ou (b) achar a API/fonte de dados por trás dele.

**Pista de onde os dados podem já estar disponíveis:** a pasta do Gustavo no OneDrive (`SAES\`) tem vários arquivos que parecem cobrir exatamente isso e ainda não foram explorados — `Macro Regiões.xlsx`, `distancia_rodoviaria.xlsx`, `Memoria_de_Calculo_Oncologica.docx`, `Indicadores_mapeados.xlsx`, pastas `PRODUÇÕES` / `PRODUÇÕES PARQUET` / `CNES`, e Power BIs como `MAPA TRANSPORTE.pbix` e `MAPA PRODUÇÃO 3.0.pbix`. Ainda não abertos nem confirmados.

### 9.4 Fronteiras reais da Bahia (macrorregião, região de saúde, município)

Gustavo apontou o projeto irmão `decan_vault\Shape_MACROREGIAO\` (repositório git próprio, malha DataSUS/IBGE) como fonte das fronteiras. Rodei o pipeline (`shapefile.py`) e gerei, especificamente para a Bahia:

- **`bahia_macro.geojson`** — as **9 macrorregiões de saúde reais** da Bahia (SUL/Ilhéus, SUDOESTE/Vitória da Conquista, OESTE/Barreiras, NORTE/Juazeiro, NORDESTE/Alagoinhas, LESTE/Salvador, EXTREMO SUL/Teixeira de Freitas, CENTRO-LESTE/Feira de Santana, CENTRO-NORTE/Jacobina) — contra as 3 fictícias que o protótipo tinha até agora.
- **`bahia_municipios.geojson`** — os **417 municípios reais** da Bahia, cada um com código IBGE, macrorregião, **região de saúde** (28 no total — o nível que o painel oficial SAGE usa pro IDR, ver seção 9.3) e população IBGE 2022.

Ambos copiados para `par_equipamentos\`.

### 9.5 Bahia real integrada ao protótipo

Gustavo decidiu (pergunta direta): **"Região de Saúde" fica só como atributo por enquanto**, não vira nível navegável no mapa/menu — mantém a navegação atual (Estado → Macrorregião → Município).

Com isso, integrei a Bahia real no `decan-prototipo_1.html`, substituindo tudo que era fictício para esse estado:
- **`DATA.BA`**: trocado de 3 macrorregiões fictícias (8 municípios) para as **9 macrorregiões reais** (417 municípios) — ids agora são os códigos oficiais do DataSUS (ex.: `2915` = Leste/Salvador), não mais slugs como `ba-leste`.
- **Mapa "macrorregiões"**: geometria real dos 417 municípios (de `bahia_municipios.geojson`, simplificada e embutida no HTML) substitui os 8 polígonos desenhados à mão. Pernambuco continua fictício (5 municípios, sem mudança).
- **Acelerador linear**: agora 100% real também no nível de município/macro pra Bahia inteira (antes só cobria os 8 municípios que já existiam na estrutura fictícia — Itabuna, Feira de Santana, Barreiras e Juazeiro, que têm acelerador de verdade, estavam de fora e agora entraram). Checagem cruzada: soma do "em operação" das 9 macros bate exatamente com o total nacional por UF (18).
- **Aba Municípios**: qualquer um dos 417 municípios reais mostra "Região de saúde", "População residente (IBGE 2022)" e "Acelerador linear em operação" como atributos reais (badge "atributos reais"), sem virar nível de navegação — demais números da tela (total de equipamentos, estabelecimentos, distância) continuam fictícios.

Validado com harness automatizado (checagem específica: soma real por macrorregião = agregado nacional; nomes limpos das 9 macros; nenhum "undefined"/"NaN" em município grande ou pequeno).

### 9.6 Recorte por macrorregião (não por município) + IDR só na aba Municípios

Gustavo trouxe como referência o painel real "Produção em Radioterapia no SUS" (CGPCAN, `C:\DataPortable\Documentos\CGPCAN\PAINEIS\RADIO1_ALTA_COMPLEXIDADE*.png`) — um painel oficial do MS com filtros ESTADO/MUNICÍPIO/CNES/MACRORREGIÃO/PROCEDIMENTO/CID, KPIs (habilitações, população SUS, casos novos, total de aceleradores, índice de eficiência) e mapa nacional. O mapa desse painel colore por **macrorregião**, não por município — ponto que Gustavo pediu pra replicar: "o recorte macrorregião deve ser apenas macrorregião".

Duas mudanças no protótipo a partir disso:

1. **Mapa "macrorregiões" agora desenha 1 forma por macrorregião**, não 417 polígonos de município. Bahia usa a fronteira real dissolvida (`BA_MACRO_GEOJSON`, gerada a partir do mesmo pipeline da seção 9.4/9.5). Pernambuco (ainda fictício) usa um casco convexo dos municípios que já existiam — aproximação, não fronteira real, documentado no código. Efeito colateral bom: o HTML do protótipo caiu de ~743KB pra ~350KB (os 417 polígonos de município da Bahia só serviam pra esse mapa; a geometria de município real gerada em 9.4/9.5 continua salva em `bahia_municipios.geojson` na pasta do projeto, só não está mais embutida no HTML).
2. **IDR saiu do Painel Geral, do comparador de regiões e do catálogo de déficit — só aparece na aba Municípios agora** (pedido direto do Gustavo). O catálogo de déficit, que antes ordenava as macrorregiões sugeridas por IDR decrescente, passou a ordenar por ordem alfabética (critério de priorização ainda em aberto, ver item 1 da seção 6). Na aba Municípios, o IDR aparece como "IDR da macrorregião (fictício)" — ainda o valor `pseudo()`, não o real do SAGE (que continua indisponível, ver seção 9.3).

Validado com harness (checagem específica: IDR ausente em Painel/Comparação/Catálogo, presente em Municípios; contagem de formas no mapa bate com 11 macrorregiões, não 422 municípios).

### 9.7 Ajustes de UX no Painel Geral (pedido direto do Gustavo)

Quatro ajustes na tela Painel Geral:

1. **Clicar num estado no mapa agora sempre seleciona**, mesmo sem dado fictício pro equipamento escolhido (antes só BA/PE eram clicáveis fora do Acelerador Linear) — mesmo comportamento que clicar numa macrorregião, que sempre seleciona.
2. **Clicar numa linha de equipamento** (no card da direita) **agora navega direto pra aba Equipamentos com aquele equipamento como filtro** — antes só o botão "Ver detalhe de equipamento ↗" fazia isso, usando o filtro do dropdown de cima, não o que a linha clicada representava.
3. **Os botões de região (chips) embaixo do mapa viraram um `<select>`** no topo do card de equipamentos — mais robusto agora que o modo Estados lista as 27 UFs.
4. **"Comparar com outra região" agora é dinâmico**: "Comparar com outro estado" no modo Estados, "Comparar com outra macrorregião" no modo Macrorregiões.

Validado com harness (`proto_assert5_painel_ux.js`).

### 9.8 Segunda rodada de ajustes (Painel Geral + Equipamentos)

**Painel Geral:**
- O seletor de estado/macrorregião saiu de dentro do card de equipamentos e virou um **slicer separado**, posicionado acima do mapa (abaixo do toggle Estados/Macrorregiões) — visualmente distinto dos cards de conteúdo.

**Equipamentos:**
- **Oferta** deixou de ser uma nuvem de chips e virou uma **tabela clicável** (Estabelecimento | Município | CNES) — clicar numa linha leva direto pra aba Municípios já com aquele município selecionado. Vale tanto no modo Macrorregiões quanto no modo Estados (nacional).
- **Nova KPI "População SUS dependente (real, IBGE)"** — real pra qualquer uma das 27 UFs (fonte: `POPULACAO_CNC(POPULAÇÃO).csv`, coluna `POPULACAO_SUS_DEPENDENTE`) e também real pras macrorregiões da Bahia (soma dos municípios via `ACEL_MUNIC`); ausente pra Pernambuco (ainda fictício).
- **Painel administrativo simplificado**: caiu de 6 colunas (Estabelecimento/Município/CNES/Portaria/Monitorado/Em operação) pra 3 (**CNES/Estabelecimento/Quantidade**) — a lógica é que o filtro de equipamento já está selecionado no topo da página, então portaria/monitorado (que existiam pra mostrar o gap administrativo) ficaram redundantes ali; essa informação de gap continua disponível nos dados (`ACEL_UF`/`ACEL_MUNIC` ainda guardam portaria/monitorado), só não aparece mais nessa tabela específica.
- **CNES sempre formatado com 7 dígitos** (`pad7()`) — aplicado em todas as 7 telas que mostram CNES no protótipo, não só nas que foram pedidas explicitamente (consistência).

Validado com harness (`proto_assert6_ajustes.js`).
