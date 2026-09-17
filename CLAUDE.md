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
`frontend/src/components/features/monitoramento-*.tsx` (estrutura flat,
ver seção "Estrutura de pastas do frontend" — só as 4 páginas ficam em
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
completa da `constiuicao_frontend.md` anexada por ele — Seção 3, árvore
flat) reverteu isso: `src/features/` foi desmontada, sem barrel. Estrutura
atual:

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
  de propósito.
- **Nomenclatura kebab-case** (Seção 3 da constituição) em todo
  Componente/Página/Context — `ConvenioCard.tsx` → `convenio-card.tsx`
  etc. (38 arquivos renomeados 2026-09-11, `git mv` preservando
  histórico). O **símbolo exportado continua PascalCase**
  (`export function ConvenioCard`) — só o nome do arquivo mudou. Hooks
  (`useXxx.ts`) e services/utils/types (`kebab-case.ts` de 1 palavra, ex.
  `api.ts`) já batiam com a convenção e não precisaram renomear. **Sem
  enforcement de lint** pra isso (oxlint só tem `react`/`typescript`/
  `oxc`, sem regra de naming) — convenção revisada à mão em PR.
- Arquivo >200 linhas foi quebrado por responsabilidade nesta mesma
  rodada (Seção 6) — ex. `monitoramento-interno.tsx` (1054→212 linhas,
  virou 10 subcomponentes/forms próprios), `painel-geral-page.tsx`
  (739→213), `mapa-page.tsx` (723→189). Lógica assíncrona de cada um saiu
  pra hook próprio em `src/hooks/` (ver seção seguinte).

## Camada de dados: services + Zod + TanStack Query + React Hook Form

Decisão de 2026-09-10 ("não adotar ainda TanStack Query/Axios") foi
**revertida** em 2026-09-11 (mesma execução da constituição, Seções 8-11).
Estado atual:

- Toda função `fetchXxx` de `src/services/api.ts` e `src/services/
  monitoramento.ts` valida a resposta com **Zod** (`z.object` espelhando
  o formato exato do backend, snake_case) antes de mapear pro tipo de
  domínio (camelCase) — falha de rede/HTTP/schema vira `ApiError`
  (`src/lib/api-error.ts`), nunca erro cru subindo pra UI.
- Todo `useState`+`useEffect`+guarda manual de corrida (padrão antigo,
  variável `cancelado`, usado porque resposta lenta de um filtro antigo
  podia sobrescrever uma resposta rápida de um filtro novo — bug real já
  visto 2x) foi trocado por **`useQuery`/`useMutation`** do
  `@tanstack/react-query` (`QueryClientProvider` em `App.tsx`,
  `src/lib/query-client.ts`) — a `queryKey` inclui toda dependência de
  filtro, o que já resolve o cancelamento nativamente.
- Os 4 forms de `monitoramento-interno-form-*.tsx` (login, cadastro,
  ação, evento) usam **React Hook Form + Zod** (`@hookform/resolvers`),
  schema em `src/lib/validations/monitoramento.ts` — campo com
  label/erro/`aria-describedby`/helper text, não mais `useState` por
  campo com só `required` nativo.
- **Gap resolvido (2026-09-11, mesmo dia)**: os componentes do domínio
  monitoramento-equipamento (`monitoramento-interno-*.tsx`,
  `convenio-card*.tsx`, `siconv-sub-abas.tsx`, `monitoramento-ui.tsx`),
  `painel-geral-*.tsx`, os modais de export (`export-*.tsx`) e
  `top-nav.tsx` também migraram de `style={{...}}` inline + `colors`/
  `layout` de `tokens.ts` pra Tailwind. `src/styles/tokens.ts` **só tem
  1 consumidor hoje**: `utils/coeficiente.ts` (usa `hiperGreenBarra`/
  `hipoRedBarra`, cor de preenchimento de barra sem equivalente em
  variável CSS/Tailwind — exceção legítima, não mover sem necessidade
  real). `monitoramento-ui.tsx` mudou `estiloCard`/`estiloInput`/
  `estiloTabela*` de `React.CSSProperties` pra string de classes
  Tailwind (`className={estiloCard}`/`cn(estiloCard, ...)`); `situacaoCor`/
  `corValidade` (devolviam hex) viraram `situacaoVariant`/`classeValidade`
  (devolvem variant/classe semântica, mesmo padrão de `utils/status.ts`).

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
  `nivel-cobertura-table.tsx`) usam o `<Table>` do shadcn completo, incluindo o
  wrapper `overflow-x-auto` — isso colide em teoria com um bug já corrigido
  (tooltip do `info-icon.tsx`, absolutamente posicionado, sendo cortado por
  `overflow != visible` em qualquer eixo ancestral, ver comentário histórico
  no código). Testado manualmente após a migração e o tooltip renderizou
  sem corte nos casos comuns (bloco de conteúdo não excede a largura do
  container) — mas o padrão pode reaparecer se um popup ficar mais largo
  que a tabela. `sub-nivel-rows.tsx` ficou de fora dessa migração pro `<Table>`
  (continua `<table>` nativo) por depender de `table-layout:fixed`, testado
  e funcionando, sem necessidade de reabrir.
- **`kpi-card.tsx` prop `color: string` (hex livre) → `variant: 'primary' |
  'destructive' | 'success' | 'warning'`** — mudança de contrato, não só de
  estilo. Call sites fora do dashboard (`monitoramento-{overview,
  equipamentos,painel}-page.tsx`) foram atualizados só nessa prop, sem
  reestilizar mais nada nessas páginas (continuam fora de escopo).

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
- **Dois roles no Neon desde o Plan Mode database 2026-09-16/17 (Bloco 1)**:
  `sigeo_runtime` (só DML — `DATABASE_URL`, usado pela API e pelos workflows
  de dado) e `sigeo_migration` (dono de todas as tabelas/sequences, único
  com DDL — `DATABASE_URL_MIGRATION`, usado só pelo Alembic).
  `Settings.database_url_alembic` cai pro `database_url` de runtime quando
  `database_url_migration` está vazio (ambiente local/teste sem essa
  separação). `neondb_owner` (role gerenciado da conta, com
  `CREATEDB`/`CREATEROLE`) não é mais usado por nenhuma credencial de
  aplicação. Migration não roda mais no boot da API nem nos jobs de dado —
  ver "Migration desacoplada do boot" logo abaixo.
- **Migration desacoplada do boot e dos jobs (mesmo Plan Mode, Bloco 4)**:
  `render.yaml` sobe a API direto com `uvicorn`, sem `alembic upgrade head`
  no `startCommand` — `sigeo_runtime` nem teria privilégio pra isso.
  `pipelines.yml`/`radar_convenios.yml` também não rodam mais migration
  (sempre foi só DML). Aplicar migration é um passo manual/isolado:
  `.github/workflows/migrar_banco.yml` (`workflow_dispatch`,
  `DATABASE_URL_MIGRATION`) ou `uv run alembic upgrade head` local — sempre
  **antes** de qualquer deploy/job que dependa de schema novo, nunca depois.

## Segurança e sessão (Plan Mode segurança 2026-09-16)

`docs/arquitetura/planmode-seguranca-2026-09-16.md` (após
`diagnostico-constituicao-seguranca-2026-09-16.md`, nota 3,4/10) definiu 5
blocos. **Blocos 1, 2, 4 e 5 implementados** (2026-09-17); **Bloco 3
implementado só na parte estrutural** (autorização movida pro Service,
escopo/matriz de role ainda pendente de decisão de produto).

**Decisão do usuário 2026-09-17, ampliando o escopo original do Bloco
1**: todo o app fica atrás de login agora — não só o monitoramento
interno. `convenios.py`/`macro_coverage.py`/`municipality_coverage.py`/
`equipment_offer.py` (antes públicos por serem "dado aberto de convênio",
ver Bloco 3 abaixo) também passaram a exigir `require_current_user`, e
`ProtectedRoute` no frontend envolve TODAS as rotas (`App.tsx`) — Painel
Geral ("/"), Dashboard, Mapa, Relatórios, Instrumentos firmados, e todo o
monitoramento interno. Motivo direto: `GET /convenios/{numero}` devolve
`siconv_raw`/`transferegov_raw` por inteiro, que contêm CEP/endereço/
telefone do item (mesmo achado do diagnóstico original, só que a fonte
migrou de JSON estático pra API viva no meio do caminho, ver Bloco 5).
Candidato a voltar a ser público no futuro: `/monitoramento-equipamentos/
painel` (Painel de Gestão do monitoramento interno) — por ora fica atrás
do mesmo gate, sem exceção.

- **Bloco 1 — leituras de monitoramento exigem sessão**: as 5 leituras de
  `backend/app/routers/monitoramento.py` (exceto `/marcos`, público por
  decisão — catálogo fixo, sem dado interno) e `GET /propostas-candidatas`
  usam `Depends(require_current_user)` (não `require_monitoramento_editor`
  — leitura, qualquer role autenticada pode ler). Frontend correspondente
  em `frontend/src/services/monitoramento.ts` manda cookie de sessão em
  toda chamada (ver Bloco 2). **Página que chama a API de monitoramento
  direto (`fetch` cru) sem passar por esse arquivo de service quebra** —
  já aconteceu 2x (`monitoramento-overview-page.tsx`,
  `monitoramento-painel-page.tsx`, corrigidas) porque o `fetch` cru nunca
  mandava credencial; checar isso antes de adicionar uma leitura nova.
  `backend/app/errors.py` não ecoa mais `input`/`ctx` de erro de validação
  (evitava vazar senha em 422 malformado). XSS do tooltip do mapa
  (`macro-map-draw.ts::construirTooltipNode`) trocado de `innerHTML` por
  nós DOM.
- **Bloco 2 — sessão via cookie HttpOnly + refresh rotativo**: token de
  acesso curto (`Settings.access_token_expire_minutes`, default 20min, não
  mais as 8h antigas) num cookie `sigeo_access`; refresh token opaco
  (`secrets.token_urlsafe`, só o HASH SHA-256 fica no banco — tabela
  `refresh_token`, `backend/app/db/models.py`) num cookie `sigeo_refresh`
  restrito a `path=/auth/refresh`. `POST /auth/refresh` rotaciona (reuso do
  token antigo falha — sinal de furto de sessão); `POST /auth/logout`
  revoga no servidor (não só limpa cookie). **Compatibilidade dupla
  temporária**: `require_current_user` ainda aceita `Authorization: Bearer`
  como fallback (`backend/app/auth.py`) — remover quando não houver mais
  tráfego assim (Fase C do rollout, ver Plan Mode seção 2.8). `JWT_SECRET`
  vazio/curto (<32 chars) derruba o **boot**, não só a primeira request
  (`Settings._validar_jwt_secret`, `backend/app/config.py`). Rate limit
  (`slowapi`, `backend/app/rate_limit.py`) em `/auth/login` (5/min) e
  `/auth/refresh` (30/min).
  - **Cookie cross-site (Vercel↔Render) precisa `SameSite=None; Secure`**
    — em dev local (`http://localhost`) isso quebra silenciosamente (login
    200, mas `/auth/me` sempre 401) porque o browser não manda cookie
    `Secure` fora de https. Local exige `COOKIE_SECURE=false` +
    `COOKIE_SAMESITE=lax` no `.env` (ver README/`.env.example`).
  - **Frontend não guarda mais token em lugar nenhum** (nem
    `localStorage`, nem estado React) — `useAuthSession`
    (`frontend/src/hooks/useAuthSession.ts`) resolve "está logado?" sempre
    perguntando `GET /auth/me` ao backend (cookie HttpOnly, JS não lê o
    valor). `services/monitoramento.ts::requisitar` tenta renovar via
    `/auth/refresh` uma vez em qualquer 401 antes de desistir; só
    redireciona pra `/login` se a renovação falhar **e** o parâmetro
    `redirecionarEm401` (default true) não tiver sido desligado —
    `fetchCurrentUser` desliga, porque roda em toda página (inclusive
    pública, ver header) só pra checar sessão, e 401 ali é visitante
    anônimo normal, não sessão expirada no meio de uma tela protegida.
  - `frontend/src/components/layout/protected-route.tsx` (`ProtectedRoute`)
    envolve as rotas de `MonitoramentoLayout` em `App.tsx` — mostra
    "Verificando sessão…" enquanto `useAuthSession` checa, só redireciona
    pra `/login` depois de confirmar que não há sessão (evita piscar
    redirect a cada F5 com sessão válida).
- **Bloco 4 (parcial) — headers e CORS**: `backend/app/main.py` tem
  middleware de `Strict-Transport-Security`/`X-Content-Type-Options`/
  `X-Frame-Options`/`Referrer-Policy` + `Content-Security-Policy-Report-Only`
  (nunca enforcement direto — calibrar com violações reais antes). CORS
  trocou `allow_methods`/`allow_headers` de `"*"` pra lista explícita
  (`Authorization` continua na lista só pela compat dupla do Bloco 2).
  `Settings._validar_cors_origins` rejeita `*` e origem `http://` fora de
  localhost no boot.
- **Bloco 3 (parcial) — autorização movida pro Service**:
  `backend/app/authz.py` (`assert_pode_editar_monitoramento`) é chamado de
  dentro de `app/services/monitoramento_instrumentos.py`,
  `app/services/monitoramento_eventos.py` (novo — extraiu a lógica que
  antes vivia inline em `atualizar_cadastro`/`registrar_evento`/
  `registrar_acao`/`concluir_acao` do router) e
  `app/services/propostas_candidatas.py` — não é mais só
  `Depends(require_monitoramento_editor)` no router; uma chamada de script/
  job que use o Service direto também é bloqueada pra `leitor`. Baseline
  documentado (não mudado por este bloco): `UserRole` é
  `admin`/`colaborador`/`leitor`, mas o gate real é binário — `admin` e
  `colaborador` têm exatamente os mesmos poderes, nenhuma checagem de
  `UserRole.admin` existe em lugar nenhum. Escopo de autorização por
  técnico/UF/órgão e diferenciação real `admin` vs `colaborador` são
  **decisão de produto pendente**, não implementadas.
- **Bloco 5 — LGPD/inventário**: `convenios.py`/`macro_coverage.py`/
  `municipality_coverage.py`/`equipment_offer.py` também passaram a exigir
  `require_current_user` (decisão do usuário 2026-09-17 de ampliar o Bloco
  1, ver acima — não são mais o caso "dado aberto de convênio sem
  necessidade de login" que a avaliação original do Bloco 3 tinha
  registrado). `frontend/public/monitoramento-equipamentos/convenios.json`/
  `siconv.json`/`transferegov.json`/`componentes_oncologia.json`/
  `programas_transferegov.json` foram **removidos** — eram cópias mortas
  (nenhum componente lia mais, `scripts/importar_convenios_banco.py` lê
  direto de `backend/scripts/output/`) servidas publicamente pelo Vercel
  sem controle de acesso nenhum; `siconv.json`/`transferegov.json`
  continham CEP/endereço/telefone do item. Os 2 consumidores restantes de
  `siconv.json` migraram para a tabela `Convenio` via API autenticada:
  `monitoramento-interno.tsx` usa `useConvenioPrograma` (1 lookup por
  número, `GET /convenios/{numero}`) em vez de baixar o dump inteiro;
  `monitoramento-painel-page.tsx` usa `fetchConvenios` (`valor_global`/
  `valor_pago_fornecedor` já pré-computados na tabela, não precisa do
  payload cru). Contrato morto de CPF **removido** (decisão do usuário):
  coluna `User.cpf_hash` dropada (migration `f8fe7ce9347c`, confirmado
  antes que só continha o sentinela `"nao-informado"`, nunca dado real),
  campo `UserCreate.cpf` removido (`schemas.py`), linha hardcoded removida
  de `scripts/criar_usuario.py`.

## Estratégia de dados do Neon: ingestão e clonagem

Decisão do usuário, 2026-09-16 (documentado no diagnóstico
`docs/arquitetura/diagnostico-constituicao-database-2026-09-16.md`, seção "Estratégia de ingestão e
clonagem"): **migração de servidor/ambiente é `pg_dump`/`pg_restore` do Neon inteiro, nunca
reingestão** (reprocessar planilha/CNPJ/JSON do zero). Isso não substitui a necessidade de dataset
sintético/anonimizado para desenvolvimento — só define que o Neon, não os scripts de importação, é
a fonte de verdade a ser clonada ao trocar de servidor/ambiente.

Três categorias de dado, para não reimportar o que já passou por correção manual nem esquecer o que
precisa de sincronização contínua:

- **Congelado (clona e não reimporta)** — passou por decisão humana/validação pontual, ou é
  estatística oficial sem cadência própria; reimportar reescreveria correção feita a mão:
  `instrumento_equipamento` (`importar_planilha_monitoramento.py`, bootstrap único já documentado);
  `convenio.cnes`/`cnes_metodo` (`importar_convenios_banco.py` — correção futura de CNES errado é
  PATCH pelo técnico, não replanilhar); `accelerator_row`, `municipality_population_row`,
  `inca_estimate` (estatística oficial ANS/INCA versionada em `data/raw/`, sem API viva — só
  reimporta por decisão explícita da equipe ao chegar arquivo oficial mais novo).
- **Vivo (clonar sozinho não basta)** — instrumento/proposta novo continua trazendo esse dado
  depois de qualquer clone congelado: `cnes_estabelecimento`, via `sincronizar_cnes_referencia.py`
  (parquet S3, precisa credencial AWS, cobertura completa) e `sincronizar_cnes_referencia_api.py`
  (ElastiCNES, sem credencial, cobre só CNES já presentes no índice de equipamentos — os dois
  coexistem por escopo diferente, nenhum substitui o outro); `job_descoberta_transferegov.py`
  (novas propostas do Radar de Convênios).
- **Pendente de decisão formal**: onde/com que frequência roda o `pg_dump`/`pg_restore` de migração
  de servidor, e como esse clone se concilia com backup/retenção/RPO-RTO (ciclo devops) e com o
  dataset sintético de desenvolvimento (ainda não existe) — ver
  `docs/arquitetura/planmode-database-2026-09-16.md`, Bloco 5.

## Comandos úteis

```bash
cd backend && uv run pytest                          # testes backend
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
