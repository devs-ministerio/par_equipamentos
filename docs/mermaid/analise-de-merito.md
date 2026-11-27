# Mapa da análise de mérito (revisão 1, de 27/11/2026)

## Objetivo e escopo

Telas de cobertura assistencial: Painel geral, Dashboard, Mapa e Relatórios de mérito. Sistema separado do monitoramento interno. Fonte da regra de cálculo: `docs/metodologia-parametros.md`.

## 1. Telas e navegação

```mermaid
flowchart TD
  RAIZ["/"] --> DO["/monitoramento-equipamentos"]:::tela
  PG["/painel-geral<br/>visão nacional"]:::tela
  DASH["/dashboard<br/>análise de mérito"]:::tela
  MAPA["/mapa<br/>nacional e rodoviário"]:::tela
  REL["/relatorios<br/>relatórios de mérito"]:::tela
  MET["/metodologia"] --> REL
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

Painel geral fica fora do `AppLayout`; Dashboard, Mapa e Relatórios ficam dentro dele. Todas exigem login.

## 2. De onde vêm os dados

```mermaid
flowchart LR
  CNES["CNES / ElastiCNES agregado"] --> PIPE["Pipelines de cobertura<br/>(app/pipeline/cobertura.py)"]
  PIPE --> TAB[("Tabelas de oferta e cobertura")]
  TAB --> EO["/equipment-offer-rows<br/>(lista, totals, by-legal-nature, facilities, establishments)"]
  TAB --> MC["/macro-coverage"]
  TAB --> MU["/municipality-coverage<br/>/health-region-coverage"]
  EO --> TELAS["Painel geral, Dashboard, Mapa"]:::tela
  MC --> TELAS
  MU --> TELAS
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

## 3. Regras que valem em todas as telas

```mermaid
flowchart TD
  Q["Oferta de equipamento"] --> S{"sus_flag = true<br/>e em uso?"}
  S -- sim --> C["Conta: in_use_sus / available_qty"]
  S -- não --> X["Fora do cálculo<br/>(existing_qty é só informativo)"]
  C --> F["Execução publicada mais recente<br/>por família (Competency.published_execution_id)"]
  M["Dado do monitoramento interno"] -. nunca entra .-> C
```

Produtividade de Acelerador Linear, Ultrassom e Mamógrafo é placeholder sem valor normativo. Município é filtrado em Python com `normalizar_texto`.

## 4. Relatórios de mérito

```mermaid
flowchart LR
  T["/relatorios"]:::tela --> F["Filtro hierárquico<br/>Brasil, Região, UF, Município, CNES"]
  F --> API["GET /relatorios?tipo_relatorio=analise_merito"]
  API --> OUT["Excel ou Word"]
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

Os relatórios do monitoramento (Equipamentos, Instrumentos, Propostas) são outro fluxo, descrito em [relatorios.md](relatorios.md).

## Registro de funcionalidades

| Funcionalidade | Onde | Estado |
| --- | --- | --- |
| Painel geral | `/painel-geral` | ativo |
| Dashboard de mérito | `/dashboard` | ativo |
| Mapa nacional e rodoviário | `/mapa` | ativo |
| Relatórios de mérito | `/relatorios` | ativo |
| `/metodologia` | redireciona a `/relatorios` | ativo |

## Código sem uso

Nada identificado nesta leitura.

## Limites desta análise

> [!warning] A confirmar
> Lista exata de filtros e indicadores de cada tela não foi mapeada aqui; o desenho acima mostra só a origem dos dados e as regras. Qual endpoint alimenta cada card não foi conferido um a um.
