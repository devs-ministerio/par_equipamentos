# Plan Mode — auditoria integral de homologação contra produção (2026-09-29)

## Objetivo e base

- Auditar **tudo** que poderá seguir de `homologacao` para `master`, não só o Painel de Gestão; corrigir regressões e provar conformidade com as constituições de frontend, backend, qualidade, segurança, database e DevOps antes de propor merge.
- Fotografia inicial: `master`/`origin/master` em `858f68a`; `homologacao`/`origin/homologacao` em `f5a7eb1`, ancestral 13 commits atrás. Há 75 arquivos rastreados diferentes de `master` e 32 não rastreados (incluindo este plano e artefato de teste); **recontar e classificar** após atualizar as refs. Nenhum commit em `master`.
- Separar no inventário: (a) novidades locais não commitadas, (b) código já publicado em `master` mas ausente em `homologacao`, (c) documentação/testes/artefatos. Preservar mudanças alheias; não resolver o descompasso de branches com descarte ou merge cego.

## Contrato de produto que a auditoria deve preservar

- Painel: valor global inclui cargas manuais confiáveis; pagamento integral é presumido **somente** para carga manual com fase interna Concluído, sem converter ausência de dado oficial em zero. Média de fase é referência sobre o recorte filtrado, não medição física.
- Mapas: CNES/coordenadas reais e GeoJSON de macrorregiões da Análise de Mérito; seleção da macro troca, no mesmo card, o mapa nacional pelo rodoviário, com destaque apenas no contorno. Nome da macro, oito posições no ranking e nenhuma inferência por município em texto livre.
- Inaugurações: realizado vem da data de ocorrência; previsto só aparece a partir do ano corrente (2026 nesta fotografia), com barras de largura coerente e espaçamento mínimo, sem zero desenhado. **Não** reintroduzir “Resumo gerado em…” na UI.
- Acesso visual: “Completude do recorte” só para `admin`; nota de previsões vencidas só para `admin`/`gestor`. A ocultação não substitui autorização no backend.
- Operação: card clicável de vigências em até 90 dias; agenda, divergências e fila de ações paginadas, com rodapés alinhados; valores, números e estados formatados como nas demais páginas. Conferir regras de vigência, licença vigente/deferida, conclusão externa e recorte de cada KPI.
- Busca livre é o primeiro filtro em **Dados Oficiais e Monitoramento Interno**, combinada aos demais, com largura/altura dos filtros; não acrescentá-la a Relatórios nem à Análise de Mérito.

## Frentes de revisão e arquivos afetados

- **Integração com produção — P0:** confrontar `backend/app/authz.py` e testes com a correção `858f68a` já em `master`; reconciliar os 13 commits de diferença em `homologacao` de forma recuperável e rodar novamente autorização, autenticação e E2E. Não presumir que `git diff master` seja apenas feature nova.
- **Backend/contratos — P1:** revisar `backend/app/repositories/monitoramento.py`, `services/monitoramento_resumo.py`, `routers/monitoramento.py`, `schemas_monitoramento.py`, testes e `frontend/src/services/monitoramento-*.ts`: N+1, limites de lista, `null` versus zero, pagamento, ações ativas, licença e `fila_acoes_truncada` sob filtros. Esse flag ainda compara carteira global e lista filtrada; corrigir sem chamar truncamento global de truncamento do recorte. Documentar o critério da licença.
- **Painel — P1:** revisar `frontend/src/pages/monitoramento-painel-page.tsx`, `components/features/monitoramento-painel-*.tsx` e `lib/monitoramento-painel-*.ts`: todos os dashboards, mapas, paleta, legendas, filtros, paginação, modal, estados e KPIs contra o contrato acima. Decidir explicitamente faixas de prazo vencido/0–30/31–90, ainda ausentes no plano original; extrair responsabilidades dos componentes que excedem ~200 linhas quando melhorar a clareza.
- **Outras telas — P1:** revisar `components/layout/{app-header,top-nav,user-menu}.tsx`, páginas de Dados Oficiais, Relatórios, Mesa e detalhe do Monitoramento, componentes de propostas/SICONV e tabelas da Análise de Mérito. Verificar navegação mobile, sininho fora do menu, seletor de equipamento, busca local, cards, linha do tempo, tabelas e exports; não estender decisões de um módulo a outro sem pedido.
- **Arquitetura/segurança — P1:** reutilizar componentes/tokens e estado em hooks; resposta HTTP validada por Zod, erros normalizados, sem regra de domínio duplicada na UI. Auditar permissões reais, dados sensíveis, links externos e exportação; classificar achados do `diagnostico-constituicao-seguranca-2026-09-29.md` entre regressão deste delta e dívida preexistente, sem declarar conformidade de segurança por lint verde.
- **Documentação — P2:** atualizar `CLAUDE.md`, `AGENTS.md` e `docs/metodologia-parametros.md` somente onde a implementação efetivamente mudou contrato/regra; manter decisões do usuário e histórico do produto sem afirmar que pendência foi concluída.

## Verificação e critérios de aceite

- Plano de testes por camada: unidade para cálculos/filtros, contrato Zod/rota, Repository contra Postgres efêmero com rollback, integração de Service e E2E autenticado dos fluxos críticos. Cobrir sucesso, vazio/nulo, limite, permissão, erro externo e recorte combinado; mocks só nas fronteiras de I/O.
- E2E deve exercer filtro real, agenda, paginação, modal de vigências, mapa nacional→macro→voltar, busca, navegação mobile e exportação pertinente; o teste atual de heading/mapa não substitui esses cenários. Registrar qualquer impossibilidade de banco/autenticação como **não verificado**, não como aprovado.
- Inspeção visual real a 320/375/400/768/1024/1440 px (obrigatoriamente 400 e 768), com zero overflow da página, toque/teclado, foco visível, contraste, estados loading/erro/vazio/sucesso e legibilidade de números/legendas. Conferir desktop e celular nas telas alteradas, não apenas no Painel.
- Rodar Ruff, Mypy, pytest completo e testes `-m db`, cobertura por camada (Service ≥80%, Repository ≥70%, Router ≥60%, hooks/componentes lógicos ≥70%), Oxlint, TypeScript, Vitest, build, E2E e gates reais do CI. Não reduzir limiares para fazer passar.
- Aceitar somente com inventário arquivo→módulo→evidência, divergências P0/P1 resolvidas, P2 com decisão registrada, CI verde na branch reconciliada e plano de rollback/smoke de deploy. Não fazer push, PR, merge ou deploy por consequência automática desta auditoria.
