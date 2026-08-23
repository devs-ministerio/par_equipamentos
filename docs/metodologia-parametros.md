# Metodologia e parâmetros — SIEO

Referência rápida dos parâmetros e regras normativas que o sistema já aplica hoje. Cobre só o que está **implementado e em uso** — não é a especificação completa da Metodologia, é um espelho do que o código realmente faz, com o arquivo/linha de onde tirei cada regra pra você conferir.

## Regra geral: sempre SUS

Todo cálculo de cobertura, distância ou "mais próximo" considera **só equipamento que atende SUS** (`sus_flag=true`). O total (SUS + privado) só aparece em cards explicitamente informativos ("Total de Equipamentos"), nunca entra em nenhuma conta.

- Backend: `existing_sus` / `available_qty` — nunca `existing_qty` total — em `backend/app/pipeline/cobertura.py`.
- Busca por raio (mapa): parâmetro `sus_flag=true` em `backend/app/routers/equipment_offer.py`.

## Parâmetros por família de equipamento

| Família | Produtividade (hab. SUS-dependentes/equipamento) | Como foi definido | Status |
|---|---|---|---|
| Tomógrafo | 100.000 | 1 equipamento por 100 mil habitantes (Metodologia) | Em produção |
| Ressonância Magnética | 166.666,67 | 5.000 exames/ano de capacidade ÷ necessidade de 30 exames/1.000 hab./ano | Em produção |
| PET-CT | 100.000 (placeholder) | Ainda não recebido da área — usa o mesmo número do Tomógrafo só pra não quebrar o código | Sem pipeline/dado ainda |
| Acelerador Linear | 100.000 (placeholder) | Idem acima | Sem pipeline/dado ainda |
| Ultrassom | 100.000 (placeholder) | Idem acima | Sem pipeline/dado ainda |
| Mamógrafo | 100.000 (placeholder) | Idem acima | Sem pipeline/dado ainda |

Fonte: `frontend/src/data/constants.ts` (`EQUIPAMENTOS`) e `backend/scripts/run_pipeline_*.py` (`PRODUTIVIDADE`) — os dois precisam bater; se um dia um número mudar, muda nos dois lugares.

> [!warning] A confirmar
> Os 4 placeholders (PET-CT, Acelerador Linear, Ultrassom, Mamógrafo) não têm produtividade real definida pela área ainda — não interpretar o "100.000" deles como parâmetro oficial.

## Fórmulas

Denominador de população: **SUS-dependente** = população residente (IBGE/SIDRA, ao vivo) − beneficiários de plano de saúde (ANS, arquivo de referência), nunca negativa.

```
required_qty      = ceil(população_sus_dependente / produtividade)
balance           = equipamentos_sus − required_qty
deficit_status     = "não deficiente" se balance ≥ 0, senão "deficiente"
coverage_percentage = equipamentos_sus / required_qty × 100   (null se required_qty = 0)
coeficiente         = (equipamentos_sus × produtividade) / população_sus_dependente
```

`coverage_percentage` e `coeficiente` medem a mesma coisa em unidades diferentes (percentual vs. multiplicador "1,3x") — `coeficiente ≥ 1` equivale a `coverage_percentage ≥ 100`, é o mesmo corte que decide Hipo/Hiperssuficiente.

- `required_qty`/`balance`/`deficit_status`: `backend/app/pipeline/cobertura.py::calcular_cobertura`.
- `coeficiente` (frontend, usado nos cards/tabelas/mapa): `frontend/src/utils/coeficiente.ts::calcularCoeficiente`.
- Classificação Hipo/Hiperssuficiente (rótulo e cor): `frontend/src/utils/status.ts::statusMeta` — `cobertura >= 100` = Hiperssuficiente.

**Macro sem população cadastrada** nunca fica em déficit por falta de dado (não é "deficiente", fica sem classificação de demanda) — só classifica quando há demanda real e a oferta não cobre.

## Níveis de agregação

Três granularidades, mesma fórmula em todas: **Macrorregião de saúde**, **Região de Saúde** e **Município**.

Na Região de Saúde, a população dos municípios é **somada primeiro**, e o `required_qty` é calculado sobre essa soma — não é a soma dos `required_qty` de cada município. Isso evita superestimar a demanda (cada município pequeno "puxando" 1 equipamento próprio quando na verdade a população somada da região não pede isso).

## Corte de município pequeno (drill-down)

Regra específica do **Tomógrafo**, não generalizada pras demais famílias: ao expandir uma Região de Saúde até Município, um município abaixo de 100 mil habitantes só aparece se:
- já é Hiperssuficiente (superávit "de bônus"), ou
- **nenhum** município do grupo bate 100 mil hab. **e** nenhum tem equipamento — nesse caso mostra todos, pra não parecer "sem dado" quando na verdade é só cidade pequena.

Município pequeno e Hipossuficiente fica oculto (com um aviso "+N município(s) oculto(s)") — o parâmetro nunca esperou que ele tivesse equipamento próprio.

Fonte: `frontend/src/components/dashboard/SubNivelRows.tsx` (`POPULACAO_MINIMA_PARA_HIPO`).

## Distância / raio de 75 km — **informativo, não é parâmetro oficial**

O Caderno 1 (SUS, 2017) prevê o critério "1 por 100 mil habitantes **OU** raio de 75 km, o que for atingido primeiro" pro Tomógrafo. Hoje só a parte populacional entra na classificação oficial (`deficit_status`). A distância existe, é calculada e mostrada, mas **não muda** se um município é Hipo ou Hiperssuficiente.

O que já existe:
- `distance_km_nearest_equipment` (só Tomógrafo, calculado no pipeline): Haversine entre a sede do município (coordenada do IBGE) e o tomógrafo SUS geocodificado mais próximo, em **qualquer lugar do Brasil** — sem respeitar fronteira de macro/UF, sem limite de raio. `backend/app/pipeline/geo.py` + `backend/scripts/run_pipeline_tomografo.py`.
- Demais famílias: sem campo pré-calculado — calculado ao vivo no navegador (mesma fórmula, SUS-only) quando o usuário seleciona um município no Mapa. `frontend/src/utils/geo.ts`.
- Cards "Distância mais próxima" / "Equipamento mais próximo" e o contorno do município no mapa (polígono oficial, API do IBGE) usam esse dado — só no Mapa, só visual.

**Por que não virou parâmetro oficial**: testei aplicar "dentro de 75km de QUALQUER tomógrafo do Brasil → não deficiente" e isso mudaria **99,95%** dos municípios hoje deficientes pra não-deficientes — sinal forte de que o critério real precisa respeitar uma rede de referência regional (não distância nacional pura), o que não foi confirmado com a normativa/DECAN ainda. Fica pendente até essa confirmação.

## Execuções por família

Cada família (Tomógrafo, Ressonância, ...) tem sua própria `Competency`/`Execution` — "a execução mais recente" é sempre resolvida **dentro** da família selecionada, nunca globalmente (bug real corrigido: antes pegava a mais recente de qualquer família, e o filtro por família dava 0 linhas se a mais recente fosse de outra). `backend/app/routers/*.py::_latest_execution_id`.
