# Dicionário de dados: Cobertura

Análise de mérito: pipelines de cobertura, déficit e distância. Gerado do schema real no head `d9e0f1a2b3c4` e dos modelos em `backend/app/db/`. Legenda e convenções em [README](README.md).

## `reference_file`

Arquivo de referência (aceleradores ou população) usado pelos pipelines de cobertura.

Chave primária: `id`. Colunas: 7. Uso: 2 linhas em produção (contagem exata de 22/11/2026).

Só carga ou pipeline. Duas linhas em produção; decisão sobre o futuro da tabela ainda aberta no relatório de limpeza.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `uploaded_by` | [`user`](acesso-avisos.md#user).`id` | SET NULL |

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `type` | enum `reference_file_type` | não | Tipo do arquivo de referência: accelerator ou population. | valores: accelerator, population |
| `reference_period` | date | sim | Período de referência do arquivo; nulo em todas as linhas. |  |
| `original_file` | texto | não | Nome do arquivo original enviado. |  |
| `uploaded_by` | bigint | sim | Referência a `user.id`. | FK `user.id` (SET NULL) |
| `uploaded_at` | timestamptz | não | Data e hora do envio. | padrão `now()` |
| `active` | boolean | não | Se é o arquivo vigente do seu tipo. | padrão `true` |

## `accelerator_row`

Aceleradores lineares por estabelecimento, vindos do arquivo de referência.

Chave primária: `id`. Colunas: 7. Uso: 0 linhas em produção (contagem exata de 22/11/2026).

Vazia em produção e sem leitura pelo app; candidata a remoção (relatório de limpeza).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `reference_file_id` | [`reference_file`](cobertura.md#reference_file).`id` | CASCADE |

Restrições:

- `ck_accelerator_row_operational_qty`: CHECK ((operational_qty >= 0))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `reference_file_id` | bigint | não | Referência a `reference_file.id`. | FK `reference_file.id` (CASCADE) |
| `cnes_code` | texto | não | Código CNES do estabelecimento. |  |
| `facility_name` | texto | não | Nome do estabelecimento. |  |
| `state` | varchar(2) | não | UF. |  |
| `ibge_code` | texto | não | Código IBGE do município. |  |
| `operational_qty` | integer | não | Quantidade de aceleradores em operação (≥ 0). | padrão `0` |

## `municipality_population_row`

População por município (residente, ANS e SUS-dependente) usada pelos pipelines.

Chave primária: `id`. Colunas: 6. Uso: 11.140 linhas em produção (contagem exata de 22/11/2026).

Mantida por decisão do usuário (22/11/2026): uso futuro. Só carga ou pipeline, sem leitura pelo app.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `reference_file_id` | [`reference_file`](cobertura.md#reference_file).`id` | CASCADE |

Restrições:

- `ck_municipality_population_row_ans_population`: CHECK ((ans_population >= 0))
- `ck_municipality_population_row_resident_population`: CHECK ((resident_population >= 0))
- `ck_municipality_population_row_sus_dependent_population`: CHECK ((sus_dependent_population >= 0))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `reference_file_id` | bigint | não | Referência a `reference_file.id`. | FK `reference_file.id` (CASCADE) |
| `ibge_code` | texto | não | Código IBGE do município. |  |
| `resident_population` | integer | não | População residente. |  |
| `ans_population` | integer | não | População coberta por plano de saúde (ANS). |  |
| `sus_dependent_population` | integer | não | População SUS-dependente (denominador de demanda da cobertura). |  |

## `competency`

Competência (AAAA-MM) de uma família de equipamento.

Chave primária: `id`. Colunas: 5. Uso: 6 linhas em produção (contagem exata de 22/11/2026).

Cada família tem a sua competência e a sua execução. A execução publicada é a apontada por `published_execution_id`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `published_execution_id` | [`execution`](cobertura.md#execution).`id` | RESTRICT |

Restrições:

- Único `competency_label_equipment_family_key`: (label, equipment_family)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `label` | texto | não | Rótulo da competência. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `published_execution_id` | bigint | sim | Referência a `execution.id`. | FK `execution.id` (RESTRICT) |
| `equipment_family` | texto | não | Família de equipamento; cada família tem competência e execução próprias. | padrão `'TOMOGRAFO'` |

## `execution`

Execução do pipeline de cobertura de uma competência.

Chave primária: `id`. Colunas: 16. Uso: 6 linhas em produção (contagem exata de 22/11/2026).

A execução mais recente é por família; usar `obter_execucao_publicada_mais_recente`, que só aceita a execução apontada por `Competency.published_execution_id`.

`executed_by`, `accelerator_file_id`, `population_file_id` e `deleted_by` não têm referência no código e estão nulas em produção.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `accelerator_file_id` | [`reference_file`](cobertura.md#reference_file).`id` | SET NULL |
| `competency_id` | [`competency`](cobertura.md#competency).`id` | RESTRICT |
| `deleted_by` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `executed_by` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `population_file_id` | [`reference_file`](cobertura.md#reference_file).`id` | SET NULL |

Restrições:

- Único `execution_competency_id_version_key`: (competency_id, version)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `competency_id` | bigint | não | Referência a `competency.id`. | FK `competency.id` (RESTRICT) |
| `version` | integer | não | Número da versão da execução na competência. **A confirmar.** |  |
| `mode` | enum `execution_mode` | não | Modo: manual ou automatic. | valores: manual, automatic |
| `status` | enum `execution_status` | não | Estado: draft, published ou archived. | padrão `'draft'_status`; valores: draft, published, archived |
| `started_at` | timestamptz | não | Início da execução do pipeline. | padrão `now()` |
| `finished_at` | timestamptz | sim | Fim da execução; nulo enquanto roda. |  |
| `executed_by` | bigint | sim | Referência a `user.id`. | FK `user.id` (SET NULL) |
| `error` | texto | sim | Mensagem de erro, quando a execução falhou. |  |
| `config_chave_macrorregiao` | texto | não | Valor de `chave_macrorregiao` vigente quando a execução rodou. |  |
| `config_denominador_oferta` | texto | não | Valor de `denominador_oferta` vigente quando a execução rodou. |  |
| `accelerator_file_id` | bigint | sim | Referência a `reference_file.id`. | FK `reference_file.id` (SET NULL) |
| `population_file_id` | bigint | sim | Referência a `reference_file.id`. | FK `reference_file.id` (SET NULL) |
| `active_sources` | jsonb | não | Fontes de dados ativas na execução (JSON). | padrão `'{}'` |
| `deleted_at` | timestamptz | sim | Data e hora da exclusão lógica da execução. |  |
| `deleted_by` | bigint | sim | Referência a `user.id`. | FK `user.id` (SET NULL) |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `version`.

## `equipment_offer_row`

Oferta de equipamentos por estabelecimento (CNES/ElastiCNES agregado) numa execução.

Chave primária: `id`. Colunas: 19. Uso: 24.686 linhas em produção (contagem exata de 22/11/2026).

Metodologia: a cobertura conta só oferta SUS (`sus_flag = true`) e em uso (`in_use_qty`); `existing_qty` é informativo. Fonte da regra: `docs/metodologia-parametros.md`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `execution_id` | [`execution`](cobertura.md#execution).`id` | CASCADE |

Restrições:

- `ck_equipment_offer_row_existing_qty`: CHECK ((existing_qty >= 0))
- `ck_equipment_offer_row_in_use_qty`: CHECK ((in_use_qty >= 0))
- `ck_equipment_offer_row_latitude`: CHECK (((latitude IS NULL) OR ((latitude >= ('-90')) AND (latitude <= (90)))))
- `ck_equipment_offer_row_longitude`: CHECK (((longitude IS NULL) OR ((longitude >= ('-180')) AND (longitude <= (180)))))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `execution_id` | bigint | não | Referência a `execution.id`. | FK `execution.id` (CASCADE) |
| `cnes_code` | texto | não | Código CNES do estabelecimento. |  |
| `ibge_code` | texto | não | Código IBGE do município. |  |
| `state` | varchar(2) | não | UF. |  |
| `equipment_family` | texto | não | Família de equipamento. |  |
| `equipment_subtype` | texto | sim | Subtipo do equipamento, quando existe. **A confirmar.** |  |
| `existing_qty` | integer | não | Quantidade existente (informativo; não entra no cálculo). | padrão `0` |
| `in_use_qty` | integer | não | Quantidade em uso no SUS; entra no cálculo de cobertura (`available_qty`). | padrão `0` |
| `sus_flag` | boolean | não | Se o equipamento está disponível ao SUS; o cálculo usa só `true`. | padrão `false` |
| `facility_name` | texto | sim | Nome do estabelecimento. |  |
| `municipality_name` | texto | sim | Nome do município. |  |
| `macro_code` | texto | sim | Código da macrorregião de saúde. |  |
| `macro_name` | texto | sim | Nome da macrorregião de saúde. |  |
| `health_region_code` | texto | sim | Código da região de saúde. |  |
| `health_region_name` | texto | sim | Nome da região de saúde. |  |
| `latitude` | numeric | sim | Latitude do estabelecimento (campo `location` do ElastiCNES); nula sem coordenada. Dá o pino exato no mapa. |  |
| `longitude` | numeric | sim | Longitude do estabelecimento; ver `latitude`. |  |
| `legal_nature` | texto | sim | `NATUREZA JURIDICA CATEGORIA` do ElastiCNES (ex.: "PRIVADO", "PUBLICO") -- texto cru da fonte, sem enum: e vocabulario do CNES, nao nosso, pode ganhar categoria nova sem passar por migration. |  |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `equipment_subtype`.

## `macro_coverage`

Cobertura e déficit por macrorregião, família e execução.

Chave primária: `id`. Colunas: 16. Uso: 426 linhas em produção (contagem exata de 22/11/2026).

Resultado do cálculo de `backend/app/pipeline/cobertura.py`. Nunca usar dado do monitoramento interno aqui.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `execution_id` | [`execution`](cobertura.md#execution).`id` | CASCADE |

Restrições:

- `ck_macro_coverage_available_qty`: CHECK (((available_qty IS NULL) OR (available_qty >= 0)))
- `ck_macro_coverage_estimated_need`: CHECK (((estimated_need IS NULL) OR (estimated_need >= (0))))
- `ck_macro_coverage_existing_qty`: CHECK (((existing_qty IS NULL) OR (existing_qty >= 0)))
- `ck_macro_coverage_facility_count`: CHECK (((facility_count IS NULL) OR (facility_count >= 0)))
- `ck_macro_coverage_population`: CHECK (((population IS NULL) OR (population >= 0)))
- `ck_macro_coverage_population_ans`: CHECK (((population_ans IS NULL) OR (population_ans >= 0)))
- `ck_macro_coverage_population_residente`: CHECK (((population_residente IS NULL) OR (population_residente >= 0)))
- `ck_macro_coverage_required_qty`: CHECK (((required_qty IS NULL) OR (required_qty >= 0)))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `execution_id` | bigint | não | Referência a `execution.id`. | FK `execution.id` (CASCADE) |
| `macro_code` | texto | não | Código da macrorregião. |  |
| `macro_name` | texto | não | Nome da macrorregião. |  |
| `state` | varchar(2) | não | UF. |  |
| `equipment_family` | texto | não | Família de equipamento. |  |
| `population` | integer | sim | População SUS-dependente (IBGE menos ANS); denominador de demanda do cálculo. |  |
| `estimated_need` | numeric | sim | Necessidade estimada (demanda) da família na macrorregião. |  |
| `required_qty` | integer | sim | Quantidade de equipamentos necessária. |  |
| `available_qty` | integer | sim | Quantidade disponível ao SUS e em uso. |  |
| `existing_qty` | integer | sim | Quantidade existente (informativo). |  |
| `facility_count` | integer | sim | Quantidade de estabelecimentos. |  |
| `balance` | integer | sim | Saldo: disponível em uso no SUS menos necessário (negativo indica déficit). |  |
| `deficit_status` | enum `deficit_status` | não | Situação do déficit: deficient, not_deficient ou not_available. | valores: deficient, not_deficient, not_available |
| `population_residente` | integer | sim | População residente, guardada para rastreio. |  |
| `population_ans` | integer | sim | População coberta por plano de saúde, guardada para rastreio. |  |

## `municipality_coverage`

Mesmo cálculo da macrorregião, por município, mais distâncias até equipamento e radiofármaco.

Chave primária: `id`. Colunas: 24. Uso: 19.290 linhas em produção (contagem exata de 22/11/2026).

Alimenta a tabela de cobertura assistencial do Dashboard quando o filtro chega ao município. Filtro de município faz-se em Python com `normalizar_texto`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `execution_id` | [`execution`](cobertura.md#execution).`id` | CASCADE |

Restrições:

- `ck_municipality_coverage_available_qty`: CHECK (((available_qty IS NULL) OR (available_qty >= 0)))
- `ck_municipality_coverage_distance_km_nearest_equipment`: CHECK (((distance_km_nearest_equipment IS NULL) OR (distance_km_nearest_equipment >= (0))))
- `ck_municipality_coverage_distance_km_nearest_radiopharma`: CHECK (((distance_km_nearest_radiopharma IS NULL) OR (distance_km_nearest_radiopharma >= (0))))
- `ck_municipality_coverage_estimated_need`: CHECK (((estimated_need IS NULL) OR (estimated_need >= (0))))
- `ck_municipality_coverage_existing_qty`: CHECK (((existing_qty IS NULL) OR (existing_qty >= 0)))
- `ck_municipality_coverage_facility_count`: CHECK (((facility_count IS NULL) OR (facility_count >= 0)))
- `ck_municipality_coverage_hours_air_nearest_radiopharma`: CHECK (((hours_air_nearest_radiopharma IS NULL) OR (hours_air_nearest_radiopharma >= (0))))
- `ck_municipality_coverage_hours_road_nearest_radiopharma`: CHECK (((hours_road_nearest_radiopharma IS NULL) OR (hours_road_nearest_radiopharma >= (0))))
- `ck_municipality_coverage_population`: CHECK (((population IS NULL) OR (population >= 0)))
- `ck_municipality_coverage_population_ans`: CHECK (((population_ans IS NULL) OR (population_ans >= 0)))
- `ck_municipality_coverage_population_residente`: CHECK (((population_residente IS NULL) OR (population_residente >= 0)))
- `ck_municipality_coverage_required_qty`: CHECK (((required_qty IS NULL) OR (required_qty >= 0)))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `execution_id` | bigint | não | Referência a `execution.id`. | FK `execution.id` (CASCADE) |
| `ibge_code` | texto | não | Código IBGE do município. |  |
| `municipality_name` | texto | não | Nome do município. |  |
| `health_region_code` | texto | sim | Código da região de saúde. |  |
| `health_region_name` | texto | sim | Nome da região de saúde. |  |
| `macro_code` | texto | sim | Código da macrorregião. |  |
| `macro_name` | texto | sim | Nome da macrorregião. |  |
| `state` | varchar(2) | não | UF. |  |
| `equipment_family` | texto | não | Família de equipamento. |  |
| `population` | integer | sim | SUS-dependente -- ver MacroCoverage |  |
| `population_residente` | integer | sim | População residente, guardada para rastreio. |  |
| `population_ans` | integer | sim | População coberta por plano de saúde, guardada para rastreio. |  |
| `estimated_need` | numeric | sim | Necessidade estimada (demanda) da família no município. |  |
| `required_qty` | integer | sim | Quantidade de equipamentos necessária. |  |
| `available_qty` | integer | sim | Quantidade disponível ao SUS e em uso. |  |
| `existing_qty` | integer | sim | Quantidade existente (informativo). |  |
| `facility_count` | integer | sim | Quantidade de estabelecimentos. |  |
| `balance` | integer | sim | Saldo: disponível em uso no SUS menos necessário (negativo indica déficit). |  |
| `deficit_status` | enum `deficit_status` | não | Situação do déficit: deficient, not_deficient ou not_available. | valores: deficient, not_deficient, not_available |
| `distance_km_nearest_equipment` | numeric | sim | Distância (Haversine, km) até o equipamento SUS geocodificado mais próximo da família, em qualquer UF. |  |
| `distance_km_nearest_radiopharma` | numeric | sim | Distância (Haversine, km) até o produtor de radiofármaco PET (FDG-18F) mais próximo, em qualquer UF. |  |
| `hours_road_nearest_radiopharma` | numeric | sim | Tempo estimado por estrada (horas) até o produtor de radiofármaco mais próximo. Vem de fórmula, não de rota real. |  |
| `hours_air_nearest_radiopharma` | numeric | sim | Tempo estimado por via aérea (horas) até o produtor de radiofármaco mais próximo. Vem de fórmula. |  |

## `inca_estimate`

Estimativa de casos novos do INCA por UF ou capital.

Chave primária: `id`. Colunas: 7. Uso: 0 linhas em produção (contagem exata de 22/11/2026).

Vazia em produção; candidata a remoção (relatório de limpeza).

Restrições:

- `ck_inca_estimate_estimated_cases`: CHECK ((estimated_cases >= 0))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `level` | enum `inca_estimate_level` | não | Nível da estimativa: uf ou capital. | valores: uf, capital |
| `uf` | varchar(2) | não | UF da estimativa. |  |
| `capital_ibge_code` | texto | sim | Código IBGE da capital, no nível capital; sem uso (tabela vazia). |  |
| `estimated_cases` | integer | não | Casos novos estimados (≥ 0). |  |
| `triennium` | texto | não | Triênio da estimativa do INCA. |  |
| `active` | boolean | não | Se é a estimativa vigente. | padrão `true` |

## `config_decision`

Decisões de configuração da metodologia, com histórico.

Chave primária: `id`. Colunas: 8. Uso: 3 linhas em produção (contagem exata de 22/11/2026).

Trilha de auditoria: nunca se altera `value`. Registrar decisão nova fecha a vigente (`valid_to`) e insere outra, por `app/config_decisions.py::registrar_decisao`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `confirmed_by` | [`user`](acesso-avisos.md#user).`id` | SET NULL |

Restrições:

- Único `uq_config_decision_key_vigente`: USING btree (key) WHERE (valid_to IS NULL)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `key` | enum `config_decision_key` | não | Chave de configuração: chave_macrorregiao, denominador_oferta ou metrica_cobertura. | valores: chave_macrorregiao, denominador_oferta, metrica_cobertura |
| `value` | texto | não | Valor escolhido para a chave. |  |
| `confirmed` | boolean | não | Se a decisão foi confirmada. | padrão `false` |
| `confirmed_by` | bigint | sim | Referência a `user.id`. | FK `user.id` (SET NULL) |
| `confirmed_at` | timestamptz | sim | Quando foi confirmada. |  |
| `valid_from` | timestamptz | não | Início da vigência. | padrão `now()` |
| `valid_to` | timestamptz | sim | NULL = vigente. Preenchido com now() no exato INSERT que a substitui (ver registrar_decisao) -- nunca um UPDATE solto depois. |  |
