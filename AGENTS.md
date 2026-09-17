# Contexto do projeto — SIGEO (par_equipamentos)

Leia [`README.md`](README.md) primeiro para stack e como rodar. Este arquivo
é sobre convenções e pegadinhas específicas deste repo.

## Fonte da verdade de regra de negócio

**Nunca reimplementar ou reexplicar regra de cálculo (cobertura, déficit,
distância, coeficiente) de memória.** A fonte da verdade é
[`docs/metodologia-parametros.md`](docs/metodologia-parametros.md) — é
mantido como espelho do que o código realmente faz, com arquivo/linha. Se o
código mudar uma regra, atualizar esse arquivo junto (não deixar
divergir); se uma regra não estiver documentada lá, checar o código antes de
assumir.

Duas regras centrais que aparecem em quase todo cálculo, para não esquecer
ao mexer em qualquer pipeline/router/componente novo:

- **Sempre SUS e em uso**: cobertura/distância/"mais próximo" usa
  `sus_flag=true` **e** `in_use_sus`/`available_qty` — nunca `existing_qty`
  (total, informativo). Ver `backend/app/pipeline/cobertura.py`.
- **"Execução mais recente" é sempre por família**: cada família de
  equipamento (Tomógrafo, Ressonância...) tem sua própria
  `Competency`/`Execution`; resolver a mais recente global já foi bug real
  (zerava linhas quando a mais recente era de outra família). Ver
  `_latest_execution_id` em `backend/app/routers/*.py`.

## docs/design vs. docs/metodologia-parametros.md

`docs/design/decan-equipamentos-contexto.md` é o histórico de produto —
decisões, avaliação da planilha original, evolução do protótipo HTML
standalone (`docs/prototipo/`). Documenta **como o produto chegou até aqui**,
não necessariamente o estado atual do app real (ex.: fala de Acelerador
Linear com dado real, mas isso foi só no protótipo HTML — no backend atual
o Acelerador ainda é placeholder, ver `docs/metodologia-parametros.md`).
Para "o que o código faz hoje", confiar em `docs/metodologia-parametros.md`
e no código, não nesse histórico.

## Monitoramento interno de equipamento (pós-repasse)

Sistema **separado** da cobertura/déficit/distância (que continuam só
CNES/ElastiCNES agregado, ver limitação abaixo). Acompanha manualmente o
que nenhum sistema federal rastreia: entrega, instalação, licenciamento
CNEN e inauguração do equipamento de um convênio específico, depois do
repasse. Schema em `backend/app/db/models.py` (seção "Monitoramento de
equipamento"), API em `backend/app/routers/monitoramento.py`, front em
`frontend/src/pages/monitoramento-{overview,instrumento,painel}-page.tsx` +
`frontend/src/components/features/monitoramento-*.tsx` (estrutura flat, ver
seção "Estrutura de pastas do frontend" — só as 4 páginas ficam em
`pages/`, todo o resto do módulo mora em `components/features/`). Overview
operacional (KPIs, fase média, licenças CNEN, inaugurações, filtros por
fase/técnico/UF/tipo de contratação) em
`/monitoramento-equipamentos/instrumentos`; detalhe por convênio em
`/monitoramento-equipamentos/instrumentos/{nr_convenio}`; painel
executivo (só dashboards — funil, pizza, barras, mapa fica pra depois,
ver limitação — pra avaliação da gestão) em
`/monitoramento-equipamentos/painel`. Desde 2026-09-10 as 4 páginas
vivem dentro de `MonitoramentoLayout` (`frontend/src/components/layout/
monitoramento-layout.tsx`), com nav própria (header unificado, ver
`app-header.tsx`) incluindo o link de volta pra análise de mérito
(`/dashboard`) — não são mais standalone fora de qualquer layout.

Quatro distinções que já causaram confusão ao mexer nisso, para não
reintroduzir o erro:

- **`EventoMarco` (histórico) ≠ `AcaoMonitoramento` (tarefa)**: evento é
  contra um catálogo FIXO de marcos (fase geral/cronograma físico/
  regulatório CNEN), sempre fechado, append-only. Ação é texto livre da
  equipe (reunião, pendência), pendente até `data_conclusao` ser
  preenchida — é o único campo que uma ação recebe depois de criada.
  Não reaproveitar uma tabela pra fazer o papel da outra.
- **Equipamento PLANEJADO (`equipamento_descricao`, vem do SICONV) ≠
  equipamento FÍSICO entregue (`equipamento_marca/modelo/numero_serie/
  vida_util_anos`, cadastrado pela equipe)**: o planejado nunca é
  editável por aqui (`InstrumentoEquipamentoUpdate` não inclui esse
  campo de propósito, ver teste
  `test_patch_cadastro_nunca_toca_equipamento_descricao`) — só o físico,
  e só depois que o estabelecimento confirma a entrega. Desde 2026-09-09
  o físico é preenchido junto do evento "Entrega no estabelecimento"
  (marco `cronograma_entrega`, ver `registrar_evento`), não mais num
  form de cadastro separado — o PATCH continua existindo só pra corrigir
  depois.
- **Escopo bem menor que os 403 convênios, e nem tudo é Convênio**: só
  cobre os instrumentos que a equipe decide monitorar (86 hoje,
  importados de `backend/scripts/importar_planilha_monitoramento.py` a
  partir da planilha real da equipe — import é bootstrap único, não
  rodar de novo como sincronização recorrente). Convênio sem
  `InstrumentoEquipamento` não é erro — é o caso normal. Desde
  2026-09-09 o campo `tipo_contratacao` distingue "Convênio" (universo
  Portal/TransfereGov, `nr_convenio` real) de "FAF"/"TED" (nunca tiveram
  número TransfereGov — `nr_convenio` aqui guarda só os DÍGITOS do NUP SEI
  (ex. NUP `25000.198305/2024-59` vira `25000198305202459`) — decisão
  2026-09-10, pedido do usuário: "tirar os caracteres especiais". Sem
  colisão entre os que existem hoje, conferido antes de aplicar. Versão
  anterior trocava `/` por `_` (motivo: `/` cru quebra a rota
  `/instrumentos/{nr_convenio}` mesmo como `%2F`, testado ao vivo) — ainda
  vale o alerta de nunca usar `/` cru nesse identificador.
- **`tecnico_titular/suplente` (nossa equipe) ≠ `responsavel_execucao_nome/
  contato` (da instituição/convenente)**: campos parecidos, fontes
  diferentes — não confundir ao exibir ou editar.

## Limitações conhecidas

- **Cobertura/déficit/distância sem granularidade por equipamento
  individual**: CNES/ElastiCNES só fornece quantidade agregada por
  estabelecimento, sem id de equipamento específico — isso não muda com
  o monitoramento interno acima (que é cadastro manual de outro
  propósito, não uma fonte pro cálculo de cobertura). Não usar dado do
  monitoramento interno em nenhum cálculo de cobertura/déficit/distância.
- Os 3 placeholders de produtividade restantes (Acelerador Linear, Ultrassom,
  Mamógrafo) não são parâmetro oficial — não usar esses números como
  referência normativa em nenhuma análise. PET-CT saiu da lista em
  2026-08-28 (produtividade real da Portaria de Consolidação n. 1/2017,
  art. 102-106 — ver `docs/metodologia-parametros.md`).
- **Painel de Gestão do monitoramento interno sem mapa geográfico** (em
  stand by, decisão do usuário 2026-09-10): faltava um jeito confiável de
  ligar `InstrumentoEquipamento.municipio` (texto livre) a uma
  macrorregião/UF sem risco de erro de grafia/acentuação — retomar
  depois que o CNES de cada convenente estiver identificado (join bem
  mais confiável que nome de município). Não propor cruzamento por nome
  de município enquanto isso não for resolvido.

## Estrutura de pastas do frontend (flat, kebab-case)

O front usou uma versão simplificada de Feature-Sliced Design
(`src/features/<nome>/{components,hooks,lib,types}/` + barrel `index.ts`)
entre 2026-09-10 e 2026-09-11. Decisão do usuário em 2026-09-11 (execução
completa da `constiuicao_frontend.md` — Seção 3, árvore flat) reverteu
isso: `src/features/` foi desmontada, sem barrel. Estrutura atual:

- `src/components/features/<nome-kebab-case>.tsx` — todo componente de
  domínio que antes vivia numa feature, agora flat (sem subpasta por
  domínio). Import direto do arquivo (`@/components/features/cobertura-table`),
  não mais via barrel.
- `src/hooks/`, `src/lib/`, `src/types/` — hooks/helpers/tipos que
  moravam dentro de uma feature (`features/x/hooks|lib|types/`) subiram
  pra esses diretórios de nível de app, mesclados com o que já existia
  (ex.: `lib/monitoramento-format.ts`, `types/monitoramento.ts`).
- `src/pages/*.tsx` — só composição de rota, sem lógica de negócio
  própria (mesmo princípio de antes).
- `src/components/{ui,layout,common,modals}/`, `src/context/`,
  `src/data/`, `src/utils/`, `src/styles/` — compartilhado, sem mudança
  de propósito (`types/domain.ts` é usado por ~20 arquivos,
  `data/constants.ts` por ~16, `utils/coeficiente.ts`/`utils/status.ts`
  implementam regra de cálculo citada em `docs/metodologia-parametros.md`
  e no agente `metodologia-sync` — mover esses exigiria atualizar este
  arquivo e o agente junto; não mover sem necessidade real).
- **Nomenclatura kebab-case** em todo Componente/Página/Context —
  `ConvenioCard.tsx` → `convenio-card.tsx` etc. (38 arquivos renomeados
  2026-09-11, `git mv` preservando histórico). O **símbolo exportado
  continua PascalCase** (`export function ConvenioCard`) — só o nome do
  arquivo mudou. Hooks (`useXxx.ts`) e services/utils/types
  (`kebab-case.ts` de 1 palavra, ex. `api.ts`) já batiam com a convenção.
  **Sem enforcement de lint** pra isso (oxlint só tem `react`/
  `typescript`/`oxc`, sem regra de naming) — convenção revisada à mão em
  PR.
- Arquivo >200 linhas foi quebrado por responsabilidade nesta mesma rodada
  — ex. `monitoramento-interna.tsx` (1054→212 linhas, virou 10
  subcomponentes/forms próprios), `painel-geral-page.tsx` (739→213),
  `mapa-page.tsx` (723→189). Lógica assíncrona de cada um saiu pra hook
  próprio em `src/hooks/`. **Reavaliação de 2026-09-17
  (`diagnostico-constituicao-frontend-2026-09-16.md`) encontrou 21
  arquivos novamente acima de 200 linhas** — quebra de arquivo grande não
  é regra automática de uma vez, precisa de revisão contínua a cada
  feature nova; ver `planmode-frontend-2026-09-17.md` para o roadmap de
  correção.
- Decisão explícita 2026-09-10, **revertida em 2026-09-11**: TanStack
  Query/Zod/React Hook Form foram adotados (ver seção seguinte) — não
  ficou só fetch puro como o plano original previa.

## Camada de dados: services + Zod + TanStack Query + React Hook Form

- Toda função `fetchXxx` de `src/services/api.ts`, `src/services/
  convenios.ts` e `src/services/monitoramento.ts` valida a resposta com
  **Zod** antes de mapear pro tipo de domínio — falha de rede/HTTP/schema
  vira `ApiError` (`src/lib/api-error.ts`), nunca erro cru subindo pra UI.
  **Reavaliação 2026-09-17 encontrou os três services com implementação de
  transporte (cookie/CSRF/refresh) triplicada** — cada um mantém seu
  próprio mutex de refresh, o que pode gerar mais de uma rotação
  simultânea; unificação num cliente comum é o Bloco 1 de
  `planmode-frontend-2026-09-17.md`, ainda não executado.
- `useState`+`useEffect`+guarda manual de corrida foi trocado por
  **`useQuery`/`useMutation`** do `@tanstack/react-query`
  (`QueryClientProvider` em `App.tsx`) — a `queryKey` inclui toda
  dependência de filtro. Páginas de monitoramento (`overview`/`painel`)
  ainda fazem `useEffect + useState + Promise.all` em alguns pontos —
  achado P1 pendente, não migrado nesta rodada.
- Forms usam **React Hook Form + Zod** (`@hookform/resolvers`), schema em
  `src/lib/validations/monitoramento.ts` — nunca `z.object({...})` inline
  dentro do componente.

## Migração de arquitetura do frontend (em andamento, progressiva)

Desde 2026-09-10 o front está migrando de estilo inline/tokens.ts em TS puro
pra **Tailwind CSS v4 + shadcn/ui**, aos poucos — não é um rewrite de uma
vez, páginas antigas continuam em inline style até serem tocadas de novo.

- **Tailwind v4, sem `tailwind.config.js`**: config é CSS-first, tudo em
  `frontend/src/index.css` (`@theme inline`). Integração é só
  `@tailwindcss/vite` no `vite.config.ts` — nada de PostCSS/autoprefixer,
  mais leve e é o caminho recomendado hoje pra Vite.
- **Paleta em `src/index.css` espelha `src/styles/tokens.ts`**: variáveis
  `--background/--primary/--border/...` no `:root` foram preenchidas à mão
  com os valores de `tokens.ts` (não os defaults neutros do preset shadcn).
  Se `tokens.ts` mudar uma cor, replicar aqui também — ainda não há um
  script/fonte única unificando os dois.
- **shadcn init usou preset `nova` (`-b radix`)**: preset só define
  estrutura de variantes/componentes; a paleta de cor foi sobrescrita como
  no ponto acima. Fonte do preset é Geist — trocada de volta pra `Public
  Sans` (a fonte real do app, carregada via Google Fonts no `index.html`)
  em `--font-sans` dentro do `@theme inline`.
- **Cuidado com `/* ... */` em comentário CSS que contenha `*/` no meio do
  texto** (ex. "chart-*/sidebar-*"): fecha o comentário antes da hora e
  corrompe o resto do bloco. Só aparece quebrado no build minificado
  (Lightning CSS descarta a declaração malformada) — no dev server ou no
  `@tailwindcss/cli` cru passa por batido porque nenhum dos dois valida a
  sintaxe da mesma forma.
- Alias `@/*` → `src/*` configurado em `tsconfig.json` + `tsconfig.app.json`
  (sem `baseUrl` — deprecated a partir do TS 6, `paths` funciona sozinho com
  `moduleResolution: bundler`) e em `vite.config.ts`
  (`resolve.alias`, via `path.resolve(import.meta.dirname, './src')`).
- Ferramentas de build (`tailwindcss`, `@tailwindcss/vite`, `shadcn`,
  `tw-animate-css`) ficam em `devDependencies`; só o que roda em runtime no
  bundle (`class-variance-authority`, `cn`, `lucide-react`, `radix-ui`) vai
  em `dependencies`.
- Adicionar componente novo: `cd frontend && npx shadcn@latest add <nome>`
  (usa a mesma paleta automaticamente, já lê `components.json`).
- **Variáveis novas (2026-09-10, pra dashboard-cobertura/mapa-equipamentos)**:
  `--success`/`--success-foreground`/`--success-bg` (== `tokens.ts
  colors.hiperGreen`/`hiperGreenBg`), `--warning`/`--warning-foreground`
  (== `colors.logoOrange`), `--destructive-bg` (== `colors.hipoRedBg`) —
  `--destructive` sólido já existia. As variantes "Bg" existem
  especificamente pra interpolação de cor via D3 `scaleLinear` (macro-map.tsx,
  Fase 2) — isso precisa de 2 cores sólidas reais, opacidade Tailwind
  (`bg-success/15`) não serve pra interpolação matemática. Pra `className`
  comum, preferir a opacidade em vez de `bg-success-bg`.
- **`src/lib/theme-colors.ts`**: helper `resolveThemeColor(cssVarName)` que
  lê a variável CSS resolvida em runtime (`getComputedStyle`) — só pra D3/
  Leaflet (`macro-map.tsx`/`macro-map-real.tsx`), que desenham imperativamente
  e não aceitam `className`. `macro-map.tsx`/`macro-map-real.tsx` resolvem as
  variáveis 1x por render do efeito de conteúdo (nunca por elemento/marcador
  dentro de `.data().enter()`/loop de camada), pra não gerar layout
  thrashing. `--destructive-bg`/`--success-bg` (Fase 0) existem
  especificamente pra essa interpolação D3 (`escalaVermelho`/`escalaVerde`
  em `macro-map.tsx`) — 2 cores sólidas reais, não opacidade Tailwind — e o
  gradiente de legenda em `mapa-page.tsx`/`painel-geral-page.tsx` usa
  `var(--destructive)`/`var(--destructive-bg)`/`var(--success-bg)`/
  `var(--success)` direto no `style` inline (4 paradas numa única barra,
  ilegível como arbitrary-value Tailwind) — nenhum dos dois casos é uso
  geral em `className`, que continua preferindo opacidade
  (`bg-destructive/15`).
- **`utils/status.ts` (`statusMeta`) devolve `variant` semântico
  (`'success' | 'destructive'`), não mais hex** — `status-badge.tsx` usa o
  `variant` direto numa classe Tailwind; quem precisa do hex real pra
  desenho imperativo (`macro-map.tsx`, tooltip D3) resolve
  `resolveThemeColor('--' + variant)` em vez de duplicar hex.
- **Risco aceito conscientemente (decisão do usuário, 2026-09-10)**: as 3
  tabelas do dashboard (`cobertura-table.tsx`/`estabelecimento-table.tsx`/
  `nivel-cobertura-table.tsx`) usam o `<Table>` do shadcn completo, incluindo
  o wrapper `overflow-x-auto` — isso colide em teoria com um bug já corrigido
  (tooltip do `info-icon.tsx`, absolutamente posicionado, sendo cortado por
  `overflow != visible` em qualquer eixo ancestral, ver comentário histórico
  no código). Testado manualmente após a migração e o tooltip renderizou
  sem corte nos casos comuns (bloco de conteúdo não excede a largura do
  container) — mas o padrão pode reaparecer se um popup ficar mais largo
  que a tabela. `sub-nivel-rows.tsx` ficou de fora dessa migração pro
  `<Table>` (continua `<table>` nativo) por depender de
  `table-layout:fixed`, testado e funcionando, sem necessidade de reabrir.
- **`kpi-card.tsx` prop `color: string` (hex livre) → `variant: 'primary' |
  'destructive' | 'success' | 'warning'`** — mudança de contrato, não só de
  estilo. Call sites fora do dashboard (`monitoramento-{overview,
  equipamentos,painel}-page.tsx`) foram atualizados só nessa prop, sem
  reestilizar mais nada nessas páginas (continuam fora de escopo).
- **Reavaliação 2026-09-17**: build quebrado por casing duplicado
  (`Modal.tsx`/`Pagination.tsx` em `components/common/` coexistindo com
  imports em minúsculas), 15 warnings de lint (expressões sem efeito +
  violações de Fast Refresh), e CSS aspiracional sem consumidor
  (`.card-group`/`.table-editorial`/`.meta-grid`/`.kpi-row` em `index.css`).
  Correção planejada no Bloco 0 de `planmode-frontend-2026-09-17.md`, ainda
  não executada.

## Config e deploy — pegadinhas já resolvidas

- `DATABASE_URL` pode chegar em formatos diferentes por provedor
  (`postgres://`, `postgresql://` sem driver). `Settings.database_url_normalizada`
  (`backend/app/config.py`) sempre normaliza para `postgresql+psycopg://` —
  usar essa property, nunca `settings.database_url` cru, ao montar a engine.
- `CORS_ORIGINS` nunca é fixo no código — vem só de env var. Em produção
  precisa conter a URL do frontend publicado (Vercel), senão o navegador
  bloqueia a própria aplicação.
- `ConfigDecision` é audit trail: mudar uma decisão é sempre "fechar a linha
  vigente (`valid_to`) + inserir nova", nunca `UPDATE value` numa linha
  existente. Usar `app/config_decisions.py::registrar_decisao`, não montar
  isso na mão em outro lugar.

## Comandos úteis

```bash
cd backend && uv run pytest                          # testes backend
cd backend && uv run ruff check .                     # lint backend (baseline: .ruff-baseline.json)
cd backend && uv run mypy .                            # typecheck backend (baseline: .mypy-baseline.json)
cd backend && uv run alembic upgrade head             # aplicar migrations
cd backend && uv run python -m scripts.run_pipeline_tomografo
cd backend && uv run python -m scripts.run_pipeline_ressonancia
cd backend && uv run python -m scripts.run_pipeline_pet_ct
cd frontend && npm run test                            # vitest
cd frontend && npm run lint                             # oxlint
```

Pipelines de dado também rodam via GitHub Actions
(`.github/workflows/pipelines.yml`), mas só manual (`workflow_dispatch`) por
enquanto — não reativar o `schedule:` comentado sem checar antes se já existe
deploy com `DATABASE_URL` pública alcançável pelo runner.

## Subagentes deste repo

Dois subagentes em `.claude/agents/`, para tarefas de pesquisa/verificação
que valem isolamento de contexto:

- **`metodologia-sync`** — confere se `docs/metodologia-parametros.md` ainda
  bate com o código (fórmulas, parâmetro de produtividade, flags SUS/em uso).
  Invocar depois de mexer em `cobertura.py`, routers, `coeficiente.ts`,
  `status.ts`, `constants.ts` ou os `run_pipeline_*.py`.
- **`pesquisador-normativo`** — verifica na web se uma portaria/estimativa
  citada na metodologia ainda está vigente. Invocar quando surgir dúvida
  normativa ou antes de assumir que um parâmetro citado em `docs/` continua
  válido.
