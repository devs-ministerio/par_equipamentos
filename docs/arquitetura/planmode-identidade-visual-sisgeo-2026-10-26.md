# Plan Mode — identidade visual SISGEO (2026-10-26)

Base: Constituição Frontend, Seções 2, 4, 5, 14 e 15. Nenhuma implementação começa antes da aprovação deste plano.

## Atualização (2026-10-26, aprovada pelo usuário)
- O nome SISGEO e o monograma GEO já estavam na interface desde `1fc92c7` (23/10); o escopo real é aplicar o kit final (laço), o primário azul e a faixa de assinatura.
- Faixa de assinatura só em `MetricStrip` (horizontal, 3 px) e `PageHeader` (filete vertical); o `border-l-success` do card monitorado fica como está.
- Decisão registrada: Space Grotesk mantida como display, por depender do logotipo (exceção à Seção 4).
- Série dos gráficos renomeada por cor (`--painel-chart-azul/ambar/magenta/roxo/oliva/ardosia`); realizada = azul, prevista = âmbar.
- `lib/design-tokens.ts` não foi criado: `tokens.ts` segue como espelho de `index.css`.
- Fora do plano original, pedido junto: "Mais detalhes" anima altura e opacidade (`DetalhesAnimados`, Radix Collapsible, `animar-detalhes`, desligada com `prefers-reduced-motion`) nos cards de convênio, proposta e candidato do Radar; o conteúdo só fica montado quando aberto.

## Significado das cores do laço (confirmado pelo usuário, 2026-10-26)
O laço representa quatro campanhas de conscientização em oncologia: azul `#2A4D9B` (Novembro Azul, próstata), magenta `#B0236F` (Outubro Rosa, mama), roxo `#6D3FA0` (campanhas lilás, colo do útero) e âmbar `#F0902A` (Setembro Dourado, câncer infantil).
- O significado vale só para o logotipo e a faixa de assinatura. Cor de série de gráfico não representa tipo de câncer; sempre acompanha rótulo.
- Evitar usar magenta ou âmbar sozinhos para sinalizar algo específico de uma campanha fora do logotipo.

## Objetivo
- Aplicar a identidade final aprovada: logotipo com nome e anel aberto; versão reduzida só com o laço (kit em `identidade visual/final/`).
- Trocar o nome exibido de SIGEO para SISGEO na interface, incluindo título da aba e favicon (hoje é o ícone padrão do Vite).
- Impacto: o primário muda de verde-petróleo para azul institucional; cor das séries dos gráficos e acentos passa a seguir a paleta do laço.

## Definições obrigatórias (Seção 5)
- **Accent:** azul `#2A4D9B`, só em CTA primário, foco e estado ativo. Não é o azul default do shadcn; é um tom institucional composto.
- **Par tipográfico:** Space Grotesk (display) + Public Sans (corpo), já em uso e já presentes no logotipo. Fragment Mono mantida para números.
- **Assinatura visual:** faixa de 3–4 px com as quatro cores do laço no topo de cards agrupados e de KPIs, com o mesmo uso em todo o app.
- **Densidade:** compacta, de painel operacional, como hoje.

## Arquivos afetados
- `frontend/src/index.css` e `frontend/src/styles/tokens.ts`: primário, ring, secondary e foco; manter os dois em sincronia.
- `frontend/index.html` e `frontend/public/favicon.svg`: título e favicon a partir do laço; ícones de 16/32/180/512 px.
- `components/layout/app-header.tsx`, `app-footer.tsx`, `pages/login-page.tsx`, `components/features/account-action-forms.tsx`: logotipo e nome.
- `App.tsx` (rota 404), `useAuthSession.ts` e teste, `usuario-dialog-gerenciar.tsx`, `pages/auditoria-page.tsx`: textos com o nome.
- `lib/monitoramento-painel-*.ts` e `macro-map*.tsx`: paleta categórica.
- Novo: `src/assets/brand/` com os SVGs finais; `lib/design-tokens.ts` conforme Seção 5, se ainda não existir.

## Estratégia
- Reutilizar `AppHeader`, `UserMenu` e componentes shadcn; nada recriado. Criar só um componente `Logo` com variantes (completo, reduzido, claro).
- Logotipo completo a partir de `lg`; laço sozinho abaixo disso e no menu móvel.
- Migração progressiva, como a do Tailwind: tokens primeiro, depois cabeçalho e login, depois gráficos. Telas não tocadas herdam o primário novo.
- Ajustar a coleção de testes que citam o texto antigo; sem afrouxar nenhum.

## Estado
- Sem estado novo. Props para variante do `Logo`; tokens via CSS. Nada em Context, Zustand ou TanStack Query.

## UX
- Loading, erro, vazio e sucesso: nenhuma tela muda de comportamento; revisar só cores.
- Responsividade: validar 320/375/400/768/1024/1440 px; zero overflow no cabeçalho; gutter de 16 px.
- Acessibilidade: contraste AA em texto e foco com o azul sobre o creme; âmbar e magenta nunca em texto pequeno; `alt`/`aria-label` do logotipo.

## Riscos e decisões pendentes
- **Conflito com a constituição:** a tabela da Seção 4 lista Space Grotesk como fonte a não manter; o projeto a adotou como display em 2026-09-11 e o logotipo depende dela. Manter exige decisão registrada.
- **Um único acento:** o laço tem quatro cores. Restringir: quatro cores só no logotipo, na faixa de assinatura e nas séries de gráfico; UI usa só o azul.
- **Magenta próximo do `--destructive`:** nunca usar magenta como status; semáforo continua verde/vermelho.
- **Componentes compartilhados afetados:** botão, foco, badge e abas mudam de cor; exige revisão visual de todas as rotas.
- **Renomear SIGEO no restante:** `CLAUDE.md`, `AGENTS.md`, README, docs, nome do repositório e variáveis ficam fora; escopo separado.
- **Fonte do logotipo em SVG:** contornos fixos; atualizar o kit exige regerar os arquivos.
- **Normas do Governo Federal:** confirmar com a comunicação do ministério antes de uso institucional externo.

## Aceite
- Oxlint, TypeScript, Vitest e build; E2E de login; inspeção visual a 400 e 768 px nas rotas principais; contraste conferido; nenhuma referência visível a "SIGEO" na UI.
