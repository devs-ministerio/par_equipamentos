# Documentação do SISGEO

Para stack e como rodar, veja o [README da raiz](../README.md). Regras e pegadinhas ativas estão no `CLAUDE.md`.

| Pasta | O que tem | Quando abrir |
| --- | --- | --- |
| [metodologia-parametros.md](metodologia-parametros.md) | Regras de cálculo (cobertura, déficit, distância) | Antes de mexer em qualquer cálculo |
| [mermaid/](mermaid/README.md) | Mapas de fluxo: monitoramento interno e Radar de instrumentos | Entender um fluxo ou validar com a equipe |
| [arquitetura/](arquitetura/) | Referência viva: fluxo do Radar (2026-09), contratos HTTP, inventários, políticas | Consulta de desenho em vigor |
| [runbooks/](runbooks/) | Procedimentos operacionais, restore, atualizações, roteiros de release | Operar produção |
| [planos/](planos/) | Plan-modes datados (`planmode-*`) | Entender por que algo foi decidido |
| [diagnosticos/](diagnosticos/) | Diagnósticos por constituição, incidentes, revisões | Histórico de achados e correções |
| [database/](database/) | Modelo ER (`modelo_er.md` e `.mermaid`, lido por `auditar_drift_schema.py`) | Schema |
| [design/](design/) | Histórico de produto (não é o estado atual do app) | Contexto de produto |
| [monitoramento-equipamentos/](monitoramento-equipamentos/) | Fontes de ingestão e guia SICONV | Ingestão de dados |
| [referencias/](referencias/) | Material de referência normativa | Consulta |
| [assets/](assets/) | Imagens e GeoJSON de apoio | Uso por código e docs |
| [prototipo/](prototipo/) | Protótipo HTML anterior ao app | Histórico |

Documentos datados em `planos/` e `diagnosticos/` são registro do momento: não se reescrevem. Mudou o estado atual, atualize o documento vivo (`arquitetura/`, `mermaid/`, `metodologia-parametros.md`).
