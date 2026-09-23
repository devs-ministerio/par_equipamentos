# Inventário de fontes de ingestão

Atualizado em 2026-09-21 pelo fechamento de Database e Ingestão.

## Fontes ativas

- `data/Monitoramento Base de Dados - Convênio FAF TED.xlsx` — única cópia
  canônica da planilha FAF/TED; usada por
  `backend/scripts/importar_planilha_monitoramento.py`.
- `Apresentação PER-SUS.xlsx` — PERSUS I; usada por
  `backend/scripts/importar_programas_monitoramento.py`.
- `backend/scripts/data/persus_ii.csv` — PERSUS II; usada pelo mesmo
  importador.

PRONON não possui fonte de Instrumentos Firmados nem CSV ativo. O domínio
vigente é o Radar de propostas.

## Artefatos históricos B813

- `data/B8131710.xlsx` — SHA-256
  `7c41e06f1d5cae1f607dbb2880eb7a93756bba235784df15e20a67080f72fd52`;
  entrada exclusiva dos scripts B813 classificados como one-shot histórico.
- `B8131710.xlsx` nesta pasta — SHA-256
  `d3fa43ecf94977a7e13875256ffd6ec18f052f55caee0feeea0554efd9c38797`;
  cópia de contexto histórico, sem consumidor operacional.

Nenhum dos dois artefatos B813 deve ser usado como pipeline vigente. A remoção
ou movimentação exige confirmar a retenção necessária para auditoria e os
relatórios históricos associados.

## Limpeza concluída

A cópia idêntica e sem consumidor da planilha FAF/TED que ficava nesta pasta
foi removida. O SHA-256 era
`199049cde41e1700b5eb353aa33e132270463286f1c694277aa4a11f9810de36`, igual à
fonte canônica em `data/`.
