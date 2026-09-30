# Metodologia e parâmetros — SIGEO

Referência rápida dos parâmetros e regras normativas que o sistema já aplica hoje. Cobre só o que está **implementado e em uso** — não é a especificação completa da Metodologia, é um espelho do que o código realmente faz, com o arquivo/linha de onde tirei cada regra pra você conferir.

## Regra geral: sempre SUS e em uso

Todo cálculo de cobertura, distância ou "mais próximo" considera **só equipamento que atende SUS** (`sus_flag=true`) **e está em uso** (`in_use_qty`, não `existing_qty`). O total existente (SUS + privado, em uso ou não) só aparece em cards explicitamente informativos ("Total de Equipamentos"), nunca entra em nenhuma conta.

- Decisão 2026-08-24: o denominador de oferta passou de "existente e SUS" pra "em uso e SUS" — equipamento que existe mas está parado deixou de contar como oferta real. `available_qty` no banco (macro_coverage/municipality_coverage) reflete isso desde essa data; `existing_qty` continua sendo o total (informativo, não muda).
- Backend: `in_use_sus` / `available_qty` — nunca `existing_qty` total — em `backend/app/pipeline/cobertura.py`.
- Busca por raio (mapa): parâmetro `sus_flag=true` **e** `qt_uso > 0` em `backend/scripts/run_pipeline_tomografo.py` (`pontos_uso_sus_por_cnes`).

## Parâmetros por família de equipamento

| Família | Produtividade (hab. SUS-dependentes/equipamento) | Como foi definido | Status |
|---|---|---|---|
| Tomógrafo | 100.000 | 1 equipamento por 100 mil habitantes (Metodologia) | Em produção |
| Ressonância Magnética | 166.666,67 | 5.000 exames/ano de capacidade ÷ necessidade de 30 exames/1.000 hab./ano | Em produção |
| PET-CT | 1.500.000 | 1 equipamento por 1,5 milhão de habitantes (Portaria de Consolidação GM/MS n. 1/2017, art. 102-106) | Em produção (2026-08-28) |
| Acelerador Linear | 100.000 (placeholder) | Ainda não recebido da área — usa o mesmo número do Tomógrafo só pra não quebrar o código | Sem pipeline/dado ainda |
| Ultrassom | 100.000 (placeholder) | Idem acima | Sem pipeline/dado ainda |
| Mamógrafo | 100.000 (placeholder) | Idem acima | Sem pipeline/dado ainda |

Fonte: `frontend/src/data/constants.ts` (`EQUIPAMENTOS`) e `backend/scripts/run_pipeline_*.py` (`PRODUTIVIDADE`) — os dois precisam bater; se um dia um número mudar, muda nos dois lugares.

> [!warning] A confirmar
> Os 3 placeholders restantes (Acelerador Linear, Ultrassom, Mamógrafo) não têm produtividade real definida pela área ainda — não interpretar o "100.000" deles como parâmetro oficial.

## PET-CT: critério de acesso ao radiofármaco — **informativo, não é parâmetro oficial**

A mesma Portaria de Consolidação (art. 102-106) que fixa 1,5 milhão de habitantes também exige que o PET-CT esteja a uma distância que permita acesso ao radiofármaco (FDG-18F, meia-vida de 110 min) em **até 2 horas**. Só a parte populacional entra em `deficit_status` hoje — o tempo de acesso ao radiofármaco é calculado e mostrado, mas **não muda** a classificação Hipo/Hiperssuficiente (mesmo tratamento do raio de 75km do Tomógrafo, ver seção abaixo).

O que já existe (`backend/app/pipeline/radiofarmaco.py` + `backend/scripts/run_pipeline_pet_ct.py`):
- Lista de **13 produtores de radiofármaco PET** no Brasil, vendorizada em `data/raw/radiofarmacos_produtores_pet.csv` (extraída de `data/raw/radiofarmacos_fabricantes_DECAN.xlsx`, aba de fabricantes — filtrando quem produz PET de verdade, excluindo linhas só-SPECT e distribuidoras sem fábrica no Brasil).
- `distance_km_nearest_radiopharma`: Haversine entre a sede do município e o produtor mais próximo, em qualquer UF (mesmo método do raio de 75km).
- `hours_road_nearest_radiopharma` / `hours_air_nearest_radiopharma`: **estimativa por fórmula, não rota real** — sem API de roteamento (decisão 2026-08-28): rodovia = distância reta × fator de sinuosidade (1,3) ÷ velocidade média (70 km/h); avião = distância reta ÷ velocidade de cruzeiro (800 km/h) + tempo fixo de solo (1,5h de embarque/desembarque).

**Por que não virou parâmetro oficial**: mesmo caso do raio de 75km do Tomógrafo — a estimativa por fórmula (sem rota real) e a decisão de aplicar "dentro de 2h → não deficiente" na classificação oficial ainda não foram confirmadas com a área/DECAN.

## Fórmulas

Denominador de população: **SUS-dependente** = população residente (IBGE/SIDRA, ao vivo) − beneficiários de plano de saúde (ANS, arquivo de referência), nunca negativa.

```
required_qty      = ceil(população_sus_dependente / produtividade)
balance           = equipamentos_em_uso_sus − required_qty
deficit_status     = "não deficiente" se balance ≥ 0, senão "deficiente"
coverage_percentage = equipamentos_em_uso_sus / required_qty × 100   (null se required_qty = 0)
coeficiente         = (equipamentos_em_uso_sus × produtividade) / população_sus_dependente
```

`coverage_percentage` e `coeficiente` usam a mesma oferta e população, mas não são conversões exatas: a cobertura usa `required_qty` arredondado para cima, enquanto o coeficiente usa a população sem arredondamento. O corte classificatório continua equivalente para oferta inteira e população positiva: `coeficiente ≥ 1` e `coverage_percentage ≥ 100` levam a Hiperssuficiente.

- `required_qty`/`balance`/`deficit_status`: `backend/app/pipeline/cobertura.py::calcular_cobertura`.
- `coeficiente` (frontend, usado nos cards/tabelas/mapa): `frontend/src/utils/coeficiente.ts::calcularCoeficiente`.
- Classificação Hipo/Hiperssuficiente/Dados indisponíveis (rótulo e cor): `frontend/src/utils/status.ts::statusMeta` — o frontend preserva o `deficit_status` vindo do backend, sem inferir classificação apenas por `coverage_percentage`.

**Macro sem população cadastrada** não deve ser lida como superávit. Quando a API devolver `deficit_status = "not_available"`, o frontend mostra **Dados indisponíveis** em vez de converter a linha para Hipo/Hiper.

## Níveis de agregação

Três granularidades, mesma fórmula em todas: **Macrorregião de saúde**, **Região de Saúde** e **Município**.

Na Região de Saúde, a população dos municípios é **somada primeiro**, e o `required_qty` é calculado sobre essa soma — não é a soma dos `required_qty` de cada município. Isso evita superestimar a demanda (cada município pequeno "puxando" 1 equipamento próprio quando na verdade a população somada da região não pede isso).

## Corte de município pequeno (drill-down)

Regra específica do **Tomógrafo**, não generalizada pras demais famílias: ao expandir uma Região de Saúde até Município, um município abaixo de 100 mil habitantes só aparece se:
- já é Hiperssuficiente (superávit "de bônus"), ou
- **nenhum** município do grupo bate 100 mil hab. **e** nenhum tem equipamento — nesse caso mostra todos, pra não parecer "sem dado" quando na verdade é só cidade pequena.

Município pequeno e Hipossuficiente fica oculto (com um aviso "+N município(s) oculto(s)") — o parâmetro nunca esperou que ele tivesse equipamento próprio.

Fonte: `frontend/src/components/features/sub-nivel-rows.tsx` (`POPULACAO_MINIMA_PARA_HIPO`).

## Distância / raio de 75 km — **informativo, não é parâmetro oficial**

O Caderno 1 (SUS, 2017) prevê o critério "1 por 100 mil habitantes **OU** raio de 75 km, o que for atingido primeiro" pro Tomógrafo. Hoje só a parte populacional entra na classificação oficial (`deficit_status`). A distância existe, é calculada e mostrada, mas **não muda** se um município é Hipo ou Hiperssuficiente.

O que já existe:
- `distance_km_nearest_equipment` (só Tomógrafo, calculado no pipeline): Haversine entre a sede do município (coordenada do IBGE) e o tomógrafo em uso e SUS geocodificado mais próximo, em **qualquer lugar do Brasil** — sem respeitar fronteira de macro/UF, sem limite de raio. `backend/app/pipeline/geo.py` + `backend/scripts/run_pipeline_tomografo.py`.
- Demais famílias: sem campo pré-calculado — calculado ao vivo no navegador quando o usuário seleciona um município no Mapa, filtrando equipamento SUS **em uso**. `frontend/src/utils/geo.ts` + `frontend/src/pages/mapa-page.tsx`.
- Cards "Distância mais próxima" / "Equipamento mais próximo" e o contorno do município no mapa (polígono oficial, API do IBGE) usam esse dado — só no Mapa, só visual.

**Por que não virou parâmetro oficial**: testei aplicar "dentro de 75km de QUALQUER tomógrafo do Brasil → não deficiente" e isso mudaria **99,95%** dos municípios hoje deficientes pra não-deficientes — sinal forte de que o critério real precisa respeitar uma rede de referência regional (não distância nacional pura), o que não foi confirmado com a normativa/DECAN ainda. Fica pendente até essa confirmação.

## Execuções por família

Cada família (Tomógrafo, Ressonância, ...) tem sua própria `Competency`/`Execution` — "a execução mais recente" é sempre resolvida **dentro** da família selecionada, nunca globalmente (bug real corrigido: antes pegava a mais recente de qualquer família, e o filtro por família dava 0 linhas se a mais recente fosse de outra). `backend/app/repositories/execucoes.py::obter_execucao_publicada_mais_recente`.
