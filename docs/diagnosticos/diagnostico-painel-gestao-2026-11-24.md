# Diagnóstico do Painel de gestão e do Meu painel (24/11/2026)

Auditoria do Codex na branch `feat/painel-individual-tecnico` (commit 46319f2), somente leitura. Nenhum achado crítico confirmado. Ruff e mypy sem achados nos quatro arquivos de backend tocados.

## Importante

| ID | Achado | Estado |
| --- | --- | --- |
| I-01 | Segundo clique na família do gráfico de equipamentos não desfaz o filtro no Painel de gestão | Corrigido |
| I-02 | Previsão de inauguração pode virar "Realizada" (datas duplas e inferência pela entrega do acelerador) | Aberto, decisão de regra |
| I-03 | Quantidade planejada desconhecida gera totais divergentes entre KPI, tipo e UF | Aberto, decisão de regra |
| I-04 | "Valor global" tem critérios diferentes no Painel de gestão e na Carteira do Meu painel | Aberto, decisão de produto |
| I-05 | Seção 14 do mapa Mermaid generaliza os fluxos das duas telas | Aberto, documentação |
| I-06 | Catálogo de marcos bloqueia a Gestão sem alimentar a tela | Aberto |
| I-07 | Ordem de travas inversa entre cancelamento (item → instrumento) e entrega (instrumento → item) | Aberto, testar concorrência |

## Menor

| ID | Achado | Estado |
| --- | --- | --- |
| M-01 | Ano inválido na URL é aceito como filtro | Aberto |
| M-02 | Foco e rolagem por teclado parciais (colunas, Carteira) | Aberto, validar no navegador |
| M-03 | GeoJSON com contrato mais permissivo que as APIs | Aberto |
| M-04 | Leitura ORM direta e `db` posicional nos Services de cancelamento e inauguração | Aberto |
| M-05 | Exports e props sem uso (`PainelSecao`, `DistribuicaoHorizontal`, `ItemRanking.parcial`, `filtros` na seção de evolução) | Corrigido |

## Constituição do frontend

Sete arquivos acima de 200 linhas: `use-monitoramento-interno-filtros.ts` (432), `monitoramento-painel-geografia.tsx` (369), `monitoramento-meu-painel-page.tsx` (340), `painel-gestao-filtros.tsx` (305), `painel-gestao-andamento.ts` (295), `painel-tecnico-carteira.tsx` (276), `monitoramento-painel-metricas.ts` (266). Hooks `use-*.ts` fogem do padrão `useNome`.

## Lacunas de teste

Filtros por URL (ano inválido, UF × município incompatível, link legado), filtros locais da Gestão, `painel-gestao-derivados.ts` e acessibilidade do Meu painel.
