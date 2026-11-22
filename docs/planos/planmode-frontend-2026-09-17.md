# Plan Mode — frontend completo (2026-09-17)

- **Objetivo:** aplicar integralmente a Constituição Frontend e fechar os achados técnicos e visuais do `diagnostico-constituicao-frontend-2026-09-16.md`, preservando regras de negócio e contratos vigentes.
- **Impacto esperado:** interface coerente, responsiva e acessível nas 8 rotas; arquitetura sustentável; fluxos críticos testados; gates automatizados; zero código substituído ou morto.
- **Identidade:** accent verde petróleo institucional; Public Sans como display e corpo, com escala forte nos títulos; régua/faixa lateral de 3px como assinatura; densidade compacta de sistema administrativo.
- **Arquivos afetados:** `frontend/src/{components,pages,hooks,services,lib,types,styles}`, `frontend/src/index.css`, `frontend/package*.json`, `.github/workflows/`, documentação de arquitetura e apenas contratos backend indispensáveis.
- **Estado:** TanStack Query para estado remoto; estado local para interação efêmera; Context somente para família/autenticação; formulários com React Hook Form + Zod.

## Etapas de execução

1. **Base técnica — concluída:** corrigir casing/tipos/lint/build, aceitar login administrativo `.local`, normalizar 422 e remover CSS morto identificado.
2. **Transporte — concluída:** cliente HTTP único com cookie, CSRF, refresh deduplicado, retry único, redirect e `ApiError`, com testes de contrato.
3. **Shell responsivo — concluída (2026-09-17):** `AppHeader` colapsa nav/`leftExtra`/`rightExtra`/
   `UserMenu` num menu mobile (`Sheet` do shadcn) abaixo de `lg` (1024px — testado que `md`/768px
   não bastava, o nav completo não cabia numa linha só nessa largura). Container/gutter unificado
   em `CONTAINER_CLASS` (`frontend/src/lib/layout.ts`), usado por `app-header.tsx`/
   `app-layout.tsx`/`monitoramento-layout.tsx` (`TopNav.tsx` não precisou de mudança — só exporta
   `SeletorEquipamento` hoje, a barra de nav já vive só em `AppHeader`). `NavBoxesAnaliseMerito`
   empilha em 1 coluna abaixo de `sm` (640px). Verificado ao vivo (login real, dev server): 1440px
   e 768px sem overflow, header em linha única com hambúrguer funcional; no piso de largura aceito
   pela janela do Chrome nesta verificação (~500px) o `<header>` não gera overflow (492px dentro de
   500px) — o overflow de página ainda medido no Dashboard nesse teste vem do conteúdo (filtros),
   não do shell, e fica para as Etapas 5/6. Higiene no mesmo bloco: `Modal` legado removido (3
   consumidores migrados pra `<Dialog>` direto), `.table-scroll`/`.kpi*` removidos de `index.css`,
   comentários de histórico datado podados nos arquivos de services/páginas mais carregados (ver
   diagnóstico, "Efeito da execução do Bloco 3", e `CLAUDE.md`/`AGENTS.md` para o resumo).
4. **Fundação visual — concluída (2026-09-17):** `PageHeader`, `FilterWorkspace`, `DataSurface`,
   `MetricStrip`, `OperationalDetailSection`, `EmptyState`, `ErrorAlert` (`frontend/src/components/
   common/`) + primitivas shadcn `Skeleton`/`Alert`/`Sonner` (toast global montado em `App.tsx`).
   `PageHeader`/`FilterWorkspace` formalizam a composição já usada ad hoc em Dashboard/Mapa/
   Relatórios (card com gradiente + eyebrow/título/descrição, barra "Filtrar por"); `MetricStrip`
   organiza `KpiCard` numa fileira `auto-fit`/`minmax` (mesma regra de quebra em qualquer
   breakpoint). Nenhuma página foi migrada ainda pra consumir esses componentes — são só
   fundação, sem remoção de wrapper antigo (isso acontece na Etapa 5, junto da migração real).
   `next-themes` não foi adotado (removido do `package.json`) — projeto é sempre light, então o
   `Toaster` tem tema fixo em vez de um provider extra.
5. **Pilotos — concluída (2026-09-17):** Dashboard e Mesa de trabalho migraram cabeçalho/filtros/
   loading/erro pra `PageHeader`/`FilterWorkspace`/`ErrorAlert`/`Skeleton` (Bloco 4). Mesa de
   trabalho (`monitoramento-overview-page.tsx`) parou de fazer `useEffect+useState+Promise.all` --
   passou a usar `useMonitoramentoResumo`/`useMonitoramentoInstrumentos` (hooks TanStack Query que
   já existiam mas não eram consumidos por essa página). Dashboard já buscava tudo via hooks
   (`useDashboardCobertura`/`useDashboardTotais`/`useDashboardHipo`/`useFiltrosMacro`) -- só a
   composição visual mudou. `secao-propostas-candidatas.tsx` (796 linhas) dividido em 4: `lib/
   proposta-metas-resumo.ts` (parsing puro do `metas_resumo` cru -- `equipamentoPrincipal`/
   `equipamentosDaProposta`/`enderecoProposta`/`construirTimelineProposta`), `proposta-card.tsx`
   (camada 1 + CNES somente leitura), `proposta-linha-do-tempo.tsx` e `proposta-detalhe-bruto.tsx`
   (camada 2). Novo helper `campoObjeto` em `lib/campo-cru.ts` substitui os casts `typeof x ===
   'object' ? (x as Record<string, unknown>) : null` espalhados pela UI -- `Record<string,
   unknown>` cru fica confinado a `campo-cru.ts`/`proposta-metas-resumo.ts` (a camada certa pra
   dado schemaless de propósito, ver docstring lá), nunca mais tocado direto dentro de JSX de
   componente. Verificado ao vivo (login real): Dashboard e Mesa de trabalho renderizam idêntico
   ao antes; "Linhas de financiamento" sem regressão (ambiente local sem proposta cadastrada no
   momento do teste, então `CardProposta`/`DetalheBrutoProposta` não foram exercidos com dado
   real -- confiança vem de `tsc -b` limpo, já que a divisão só moveu código, não reescreveu
   lógica).
6. **Rotas analíticas — concluída (2026-09-17):** Mapa e Relatórios migraram cabeçalho pra
   `PageHeader`/loading e erro pra `Skeleton`/`ErrorAlert` (mesmo padrão do Bloco 5). Painel Geral
   (fora de `AppLayout`/`MonitoramentoLayout`, sem `PageHeader` aplicável) passou a usar
   `CONTAINER_CLASS` (Bloco 3) pro container/gutter. **Fix real de overflow (o P0 de 400px da
   auditoria)**: grid de cards do Painel Geral usava `minmax(480px,1fr)` -- maior que a viewport
   de 400px obrigatória, causava os 504px de `scrollWidth` medidos na auditoria; virou
   `minmax(min(480px,100%),1fr)` (CSS `min()`, mesma largura mínima confortável em telas largas,
   nunca ultrapassa o container em telas estreitas). Grid do Mapa (`grid-cols-[2fr_1fr]`, painel
   lateral virava coluna de ~120px em 400px) virou `grid-cols-1 lg:grid-cols-[2fr_1fr]`.
   `CardExportar` de Relatórios (dois cards lado a lado, 434px medido) virou `flex-col sm:flex-row`.
   **Exportadores pesados sob demanda**: `ExportPdfModal`/`ExportXlsxModal` (jspdf+exceljs, ~1,3MB
   somados) eram import estático direto no chunk de `relatorios-page.tsx` mesmo com os 2 cards
   `desabilitado` hoje -- viraram `lazy()` + `Suspense`; chunk da página caiu de 35,79kB pra
   11,20kB gzip, os dois modais agora são chunks próprios carregados só quando o popup abre.
   Verificado ao vivo (login real, resize até ~500px de innerWidth -- o piso que a janela do
   Chrome aceitou nesta verificação): Painel Geral, Mapa e Relatórios sem overflow de documento
   (492-500px de `scrollWidth` dentro de 500px de viewport); 768px com grade lado a lado normal.
7. **Monitoramento — concluída (2026-09-17):** Painel de Gestão parou de fazer `useEffect+
   useState+Promise.all` -- migrou pra `useMonitoramentoResumo`/`useMonitoramentoInstrumentos`/
   `useMonitoramentoMarcos` (hooks que já existiam) + `useConveniosLista` (novo hook, extraído do
   fetch que já estava inline em `monitoramento-equipamentos-page.tsx` -- mesma `queryKey`
   `['convenios-lista']` nos 2 consumidores, então abrir uma tela já esquenta o cache da outra).
   Cabeçalho migrado pra `PageHeader` nas 3 telas (Dados oficiais já usava um cabeçalho próprio
   equivalente, Painel de Gestão tinha o título verde isolado que a auditoria apontou como
   "visualmente externo ao resto do produto", Detalhe ganhou `PageHeader` com `breadcrumb` --
   `PageHeader` já suporta esse slot desde o Bloco 4). Loading/erro nas 3 páginas + no orquestrador
   `MonitoramentoInterno` migraram pra `Skeleton`/`ErrorAlert` (2 usos de emoji "⚠️" como ícone de
   erro, achado transversal #6 do diagnóstico, removidos no caminho). **Agrupamento progressivo**
   na página de Detalhe (achado da auditoria: "página muito longa sem índice local ou agrupamento
   progressivo") -- `OperationalDetailSection` (Bloco 4, `<details>` nativo) agora envolve Fase/
   cronograma (aberto por padrão), Ações (aberto só quando há ação aberta) e Linha do tempo de
   eventos (fechado por padrão); Cabeçalho/Cadastro continuam sempre visíveis (identidade/resumo,
   não fazem sentido escondidos). Verificado ao vivo (login real): as 3 páginas renderizam
   idêntico ao antes, seções expandem/recolhem corretamente, formulário de ação e timeline
   continuam funcionais dentro do `<details>`. **Não tocado nesta rodada** (fora do escopo
   literal desta etapa): a repetição de técnico/nível/equipamento em 3 áreas diferentes do
   cabeçalho/cadastro, os 7 cards de resumo com última linha órfã, e o emoji 🎉 de inauguração
   (achados de conteúdo/composição visual, não de arquitetura de dado) — candidatos a um bloco de
   polish visual futuro, não bloqueiam as etapas seguintes.
8. **Contratos e escala — parcial (2026-09-17):** `services/monitoramento.ts` (457 linhas, 23
   consumidores) dividido por domínio: `auth.ts`, `monitoramento-marcos.ts`, `monitoramento-
   instrumentos.ts`, `monitoramento-acoes.ts`, `monitoramento-resumo.ts`, `notificacoes.ts`,
   `propostas-candidatas.ts`, `cnes-referencia.ts` + `monitoramento-client.ts` (helpers `apiGet`/
   `apiGetAuthed`/`apiAuthed` compartilhados) -- todos os 23 import sites atualizados, `tsc -b`
   limpo confirma nenhum ficou pra trás. **Mensagem pública separada do detalhe técnico**:
   `ApiError` ganhou `publicMessage` (Seção 17 da constituição) -- erro de domínio (4xx/5xx real
   do backend, que já não vaza detalhe técnico desde o Plan Mode segurança) usa a mesma mensagem
   como pública; falha de rede/schema (nunca alcançou resposta de domínio) cai num fallback
   genérico, o detalhe técnico fica só em `.message` (log/console). Novo helper
   `mensagemSeguraDoErro()` em `lib/api-error.ts` substituiu todo `error.message`/`error instanceof
   Error` renderizado direto na UI (Dashboard, Mapa, Relatórios, 2 tabelas, Dados oficiais,
   `monitoramento-interno.tsx`, login, `adicionar-monitoramento-button.tsx`). **Paginação/`total`
   ou virtualização acima de 100 itens: NÃO executado** -- os tetos de segurança do backend
   (macro=1000, município=10000, instrumentos/ações=500) não devolvem `total`/`meta`, e nenhuma
   lista real do app hoje chega perto do próprio teto (86 instrumentos, 403 convênios, ~5570
   municípios < 10000) para justificar virtualização client-side agora. Resolver isso de verdade
   exige o backend passar a devolver `total`/`meta` — envelope de resposta unificado, já registrado
   no diagnóstico como mudança breaking que exige Plan Mode coordenado com o backend, fora do
   escopo que este bloco pode decidir sozinho.
9. **Acessibilidade — parcial (2026-09-17):** Os 13 cabeçalhos ordenáveis que usavam `<span
   onClick>`/`<TableHead onClick>` sem teclado nem `aria-sort` (`cobertura-table.tsx` 6,
   `nivel-cobertura-table.tsx` 4, `estabelecimento-table.tsx` 7 -- 13, não só os "quatro" citados
   no achado original, que só tinha contado uma amostra) viraram `SortableTableHead`
   (`frontend/src/components/common/sortable-table-head.tsx`, novo) -- `<button>` real dentro do
   `<th>`, `aria-sort="ascending"|"descending"|"none"` refletindo o estado, foco visível (`ring`
   do design system), testado ao vivo (clique reordena a tabela, `aria-sort` muda corretamente via
   inspeção do DOM). Escape fechando modal e Enter submetendo formulário já funcionavam
   estruturalmente (Radix `Dialog` e `<form>` nativo em todos os forms) -- não precisaram de
   mudança. **Não executado**: auditoria completa de WCAG AA (contraste, ordem de foco tab-a-tab,
   labels/`aria-describedby` em todos os campos, anúncios dinâmicos de loading/erro) nas 8 rotas --
   escopo grande demais pra este bloco, fica pra uma rodada dedicada de acessibilidade.
10. **Testes — parcial (2026-09-17):** `jsdom` + `@testing-library/react` + `jest-axe` instalados
   (`vite.config.ts`: `environment: 'jsdom'`, `globals: true` -- necessário pro auto-cleanup do
   RTL entre testes --, `setupFiles: src/test-setup.ts` registrando `@testing-library/jest-dom/
   vitest` + `jest-axe`). 18 testes novos: `EmptyState`/`ErrorAlert`/`PageHeader`/
   `SortableTableHead` (render + interação + `axe` sem violação cada um) e `AppHeader` (menu
   mobile abre/navega/fecha + `axe`, sessão mockada como fronteira externa). 1 teste de hook em
   sucesso/falha (`useMonitoramentoResumo`, service mockado). Total: 14 arquivos de teste, 60
   passando (era 8/42). **E2E**: `@playwright/test` instalado + `playwright.config.ts` + `e2e/
   login.spec.ts` (rota protegida sem sessão → redirect pra `/login`; login válido → entra),
   credencial só via env (`E2E_EMAIL`/`E2E_SENHA`, nunca hardcoded) — **não executado nesta
   sessão** (precisa de `npx playwright install chromium`, download de binário de browser, decisão
   que fica pro usuário rodar localmente/CI). Navegação e detalhe (E2E) e testes de mais
   hooks/componentes interativos ficam pra rodadas seguintes.
11. **CI e performance — concluída (2026-09-17):** `.github/workflows/frontend_ci.yml` (novo) --
   dispara em push/PR que toquem `frontend/**`, `npm ci` (lockfile travado, não `npm install`) +
   lint + typecheck + test + build, os 4 gates que já rodavam manualmente antes de cada PR (ver
   "Comandos úteis" do CLAUDE.md) agora automatizados. **E2E não entra no workflow** (precisa de
   backend rodando + credencial de teste, infraestrutura que a CI de hoje não tem — ficaria
   sempre pulado/vermelho; rodar E2E manual localmente por enquanto). Orçamento de bundle:
   `build.chunkSizeWarningLimit` subiu de 500kB (default) pra 1MB, documentado no `vite.config.ts`
   -- os 2 chunks que passam de 500kB (jspdf ~400kB, exceljs ~930kB) são `lazy()` desde o Bloco 6,
   nunca entram no carregamento inicial; 1MB continua baixo o bastante pra pegar regressão real no
   bundle eager (hoje ~380kB). Lazy loading por rota já existia (`React.lazy` em `App.tsx`, achado
   2026-08-24) e PDF/XLSX/mapas já estavam cobertos (Bloco 6 pro PDF/XLSX, mapas sempre foram
   lazy). Verificado ao vivo: `npm ci` limpo reproduzindo exatamente o que a CI roda, build sem
   warning de chunk.
12. **Higiene final — concluída (2026-09-17):** higiene já rodou em cada etapa (não só no fim) --
   `Modal` legado eliminado no Bloco 3, CSS morto nos Blocos 0/3, `Record<string, unknown>`
   confinado à camada certa no Bloco 5, `monitoramento.ts` monolítico dividido no Bloco 8.
   Varredura final: scan de arquivo-sem-importador (heurística por grep, não prova formal) achou
   `data-surface.tsx` e `metric-strip.tsx` (fundação do Bloco 4) sem consumidor real ainda --
   `MetricStrip` foi cabeado no Dashboard (substituiu os 5 `KpiCard` soltos por um `items[]`,
   testado ao vivo, visual idêntico); `DataSurface` não tinha nenhum ponto de encaixe de baixo
   risco (exigiria tocar lógica de loading/erro de alguma página, não só markup) -- **removido**
   em vez de ficar como código morto. `useJson.ts` (hook pré-existente) foi confirmado sem
   qualquer importador e removido na rodada visual conclusiva. Nenhum `console.log` encontrado.
   `npm ci` + lint + typecheck + test + build
   confirmados limpos no estado final.

13. **Polimento visual conclusivo — concluído (2026-09-17):** a entrada `/` e o destino padrão
   pós-login passaram a ser **Dados oficiais** (`/monitoramento-equipamentos`); a antiga visão
   nacional permanece em `/painel-geral`, dentro do domínio de Análise de Mérito e fora da
   navegação global. Todas as
   rotas foram navegadas com sessão real em 400px, 768px e 1440px, sem overflow horizontal do
   documento. Foram corrigidos os filtros do Dashboard, o cabeçalho/KPIs de Dados oficiais, a
   fórmula de Relatórios e os grids do Painel de Gestão/detalhe. O detalhe deixou de repetir
   equipe e classificação no cabeçalho, indicadores e cadastro; mantém esses dados em uma única
   seção editável e preserva nos indicadores apenas o resumo operacional. Emojis usados como
   iconografia de estado foram removidos. Gestão de usuários passou a usar o shell global e
   ganhou composição móvel para título, ação e filtros; a tabela larga conserva rolagem local.

14. **Rodada premium sistêmica — concluída (2026-09-17):** o cabeçalho em card/gradiente foi
   substituído em todas as rotas por uma composição editorial com régua de 3px, tipografia e
   divisor. A navegação contextual da análise virou abas sublinhadas. Métricas passaram a formar
   uma única faixa estrutural, preservando a fonte anterior dos valores. O Painel de Gestão foi
   reconstruído em hierarquia assimétrica: situação executiva, estágio, agenda crítica, qualidade
   do cadastro e composição da carteira; pizza multicolorida, barras verticais e dez cards de
   peso equivalente foram removidos. Dados oficiais e Mesa de trabalho consolidaram métricas
   redundantes. Relatórios perdeu os cards promocionais e emojis. Filtros deixaram de flutuar em
   cards com sombra; detalhes operacionais deixaram de aninhar cards. A marca global agora é
   **SIGEO — Gestão de Equipamentos em Oncologia**. `KpiCard` e `BarraDistribuicao`, substituídos
   pela nova composição, foram removidos como código morto. Todas as rotas autenticadas passaram
   pela auditoria em 400px, 768px e 1440px sem overflow horizontal global.

## UX e validação obrigatória por etapa

- Implementar e validar estados loading, error com retry, empty com CTA, success com toast e ações disabled/loading.
- Inspecionar visualmente todas as rotas em 400px, 768px e 1440px; amostrar também 320px, 375px e 1024px; registrar overflow do documento e dos containers autorizados.
- Validar navegação por teclado, foco visível, contraste, diálogos e formulários; preservar conteúdo real, hierarquia e regras SUS/metodologia.
- Executar `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build` após cada bloco; executar E2E a partir da Etapa 10.

## Riscos e critérios de encerramento

- **Riscos:** regressão de regras em páginas grandes, quebra de autenticação, mapas/exportações pesados, contratos sem paginação e conflito entre estilos legados e componentes novos; mitigar por migração rota a rota, testes e remoção no mesmo bloco.
- **Concluído somente quando:** 8/8 rotas aprovadas visualmente; zero scroll horizontal da página; WCAG AA nos fluxos críticos; páginas apenas compõem features; nenhum fetch operacional em componente; listas grandes controladas; testes React/E2E e CI verdes; busca de mortos revisada; diagnóstico atualizado com evidência e nova nota.
- **Situação atual (2026-09-17): Etapas 1–12 concluídas** (Etapas 8, 9 e 10 parciais -- ver
  detalhe de cada uma acima; os itens não fechados dependem de decisão do usuário -- rodar
  Playwright localmente -- ou de mudança de contrato do backend -- `total`/`meta` -- fora do que
  este Plan Mode decide sozinho). Não declarar "refatoração completa" nem "nota 10/10" — os
  critérios de encerramento (seção acima) documentam exatamente o que ainda falta e por quê.
