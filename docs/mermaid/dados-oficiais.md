# Mapa de Dados oficiais (revisão 1, de 27/11/2026)

## Objetivo e escopo

Página `/monitoramento-equipamentos` (destino de `/`): instrumentos firmados e linhas de financiamento. Lido de `monitoramento-equipamentos-page.tsx` e `components/features/dados-oficiais-*.tsx`.

## 1. Estrutura da página

```mermaid
flowchart TD
  RAIZ["/ e /monitoramento-equipamentos/entradas"] --> DO["/monitoramento-equipamentos"]:::tela
  DO --> AB{"aba (?aba=)"}
  AB -- "convenios" --> I["Instrumentos/Programas"]:::tela
  AB -- "componentes" --> L["Linhas de financiamento"]:::tela
  I --> M["Métricas: monitorados, concluídos,<br/>valor global, desembolsado, equipamentos"]
  I --> FI["Filtros"]
  I --> LI["Lista de instrumentos"]
  LI --> DET["/monitoramento-equipamentos/instrumentos/:nrConvenio"]:::tela
  L --> LM["Propostas e instrumentos manuais de financiamento"]
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

A aba Instrumentos/Programas mostra o total de instrumentos; a aba Linhas de financiamento mostra o total de linhas.

## 2. Escopo dos instrumentos

```mermaid
flowchart LR
  C["convenio (firmados)"] --> E{"fora_escopo_equipamentos?"}
  E -- sim --> X["Some de tudo<br/>(todos os itens são obra/serviço)"]
  E -- não --> V["Aparece na lista"]
  V --> MON{"tem monitoramento?"}
  MON -- sim --> M["instrumento_equipamento (monitorado)"]
  MON -- não --> N["Convênio sem monitoramento (caso normal)"]
```

Tipos de contratação: Convênio, FAF, TED, PERSUS I, PERSUS II.

## Registro de funcionalidades

| Funcionalidade | Onde | Estado |
| --- | --- | --- |
| Aba Instrumentos/Programas | `?aba=convenios` | ativo |
| Aba Linhas de financiamento | `?aba=componentes` | ativo |
| Métricas e filtros | `dados-oficiais-*` | ativo |

## Código sem uso

Nada identificado nesta leitura.

## Limites desta análise

> [!warning] A confirmar
> Endpoint exato que alimenta cada aba, lista de filtros e cálculo de cada métrica não foram detalhados. O redirecionamento de `/entradas` foi lido em `App.tsx`.
