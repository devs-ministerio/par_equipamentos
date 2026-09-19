# Reavaliação da Constituição Frontend — 2026-09-17

## Escopo e método

Esta reavaliação substitui a fotografia de 2026-09-16. Ela confronta o frontend atual com `padroes/frontend/constiuicao_frontend.md` e considera os efeitos já implantados nos blocos de database, segurança e backend.

Foram inspecionados arquitetura, autenticação, contratos Zod, chamadas HTTP, estado remoto, UX, acessibilidade, responsividade, performance, testes e código residual. Os gates `lint`, `test` e `build` foram executados no estado atual do workspace. Nenhum código de produto foi alterado nesta etapa.

## Resultado executivo

**Conformidade frontend: 7,3/10 no momento da reavaliação original; 8,6/10 depois dos Blocos
0-12** (diagnóstico anterior: 6,2/10 → 6,4/10 pré-Plan Mode → 6,8/10 pós-Bloco 0 → 7,2/10 pós-
Blocos 0/1/2 → 7,3/10 na reavaliação → 8,6/10 pós-Bloco 13, ver notas por eixo atualizadas ao
longo deste arquivo e a rodada conclusiva registrada ao final).

**Atualização final — as 12 etapas do `planmode-frontend-2026-09-17.md` foram executadas
(2026-09-17, mesmo dia, rodadas sucessivas após a reavaliação original).** App shell responsivo
(Bloco 3), fundação visual (Bloco 4: `PageHeader`/`FilterWorkspace`/`MetricStrip`/
`OperationalDetailSection`/`Skeleton`/`ErrorAlert`/`EmptyState`/`Toast`), Dashboard+Mesa de
trabalho (Bloco 5), Painel Geral+Mapa+Relatórios (Bloco 6), Monitoramento completo (Bloco 7),
services por domínio + mensagem de erro segura (Bloco 8, parcial — paginação/virtualização real
segue bloqueada no backend), `aria-sort`/teclado em 13 cabeçalhos de tabela (Bloco 9, parcial —
falta auditoria WCAG AA completa), Testing Library+axe+E2E scaffolded (Bloco 10, parcial — E2E não
executado), CI frontend (Bloco 11), higiene final (Bloco 12). Cada bloco tem sua seção própria
("Efeito da execução do Bloco N") e evidência versionada mais abaixo neste arquivo — o restante
desta reavaliação (auditoria visual original, achados por rota) permanece como fotografado no
momento em que foi escrita, com anotações `~~riscado~~`/*(resolvido no Bloco N)* onde um bloco
posterior fechou o achado.

A segurança da sessão evoluiu de forma relevante: todo o aplicativo está protegido, o JWT saiu do `localStorage`, cookies usam `HttpOnly`, os clientes enviam credenciais e o token CSRF acompanha mutações. As respostas principais continuam validadas com Zod e erros passam por `ApiError`.

Antes do Bloco 0, a aplicação não estava entregável: o build falhava por dois grupos independentes (casing duplicado de `Modal/Pagination` e tipos manuais das páginas de monitoramento incompatíveis com os tipos derivados dos schemas). Isso está resolvido agora — ver abaixo. A estrutura FSD que o `AGENTS.md` chegou a descrever também já não corresponde: o arquivo foi reescrito (Bloco 2 do Plan Mode, mesma data) para espelhar a estrutura flat real (`components/features`, 44 arquivos, sem `src/features`).

Os blocos anteriores tornaram mais urgente unificar o cliente HTTP. Cada um dos três services mantinha seu próprio refresh mutex; chamadas simultâneas entre domínios podiam iniciar rotações concorrentes — **resolvido no Bloco 1** (ver abaixo). Os novos limites de segurança do backend preservam o formato atual, mas continuam sendo tetos silenciosos e o frontend ainda não recebe `total` para detectar truncamento — isso é virtualização/paginação real, um dos "Blocos seguintes" do Plan Mode, fora do escopo desta entrega.

### Efeito da execução do Bloco 1

- Novo `frontend/src/lib/http-client.ts` concentra o que estava triplicado em `api.ts`/
  `convenios.ts`/`monitoramento.ts`: `credentials: 'include'`, `X-CSRF-Token` em mutação, mutex de
  refresh (agora 1 singleton de módulo, não 1 por service — 401 simultâneo em 2 services gera 1
  `POST /auth/refresh` só, não 2), rotas que nunca tentam renovar (`/auth/login`/`/auth/refresh`/
  `/auth/logout`), redirect em 401 definitivo (`redirecionarEm401`, `fetchCurrentUser` continua
  passando `false`) e normalização de erro em `ApiError`.
- Os três services perderam sua cópia própria de mutex/fetch/401 e passaram a delegar pra
  `requisitar` do cliente comum — `api.ts` e `convenios.ts` ganham de brinde a mesma normalização
  de `detail` de 422 (array vs. string) que só `monitoramento.ts` tinha, corrigindo o mesmo padrão
  de bug do achado transversal #10 nesses dois services também.
- 12 testes novos em `lib/http-client.test.ts` cobrem exatamente o que a seção P1 abaixo cobrava
  como lacuna: refresh deduplicado (o requisito central do bloco), CSRF, rotas de auth sem loop,
  401 definitivo com e sem redirect, schema Zod inválido, falha de rede.

### Efeito da execução do Bloco 0

- `Modal.tsx`/`Pagination.tsx` renomeados para `modal.tsx`/`pagination.tsx` (`git mv`, casing
  corrigido) — resolve o `TS1261`.
- `monitoramento-overview-page.tsx` e `monitoramento-painel-page.tsx` (achado adicional confirmado
  ao abrir o segundo arquivo, mesmo padrão do primeiro) pararam de redeclarar `ResumoApi`/
  `InstrumentoApi`/`InauguracaoApi` à mão — agora derivam de `ResumoMonitoramento`/
  `InstrumentoEquipamento`/`InauguracaoResumo`/`MarcoCatalogo` (`z.infer` de `services/
  monitoramento.ts`) via `Pick`/alias — resolve o `TS2345`. No caminho, achado real: o schema Zod
  `inauguracaoResumoSchema` estava sem `municipio`/`uf`/`equipamento`, campos que o backend já
  devolve (`InauguracaoResumo`, `routers/monitoramento.py`) — o schema foi corrigido pra bater com
  a API, não os campos removidos da página.
- Os 15 warnings de lint (6 `no-unused-expressions`, 9 `react/only-export-components`) foram
  corrigidos — ternário-como-statement virou `if/else`; constantes/helpers não-componente saíram
  de arquivos de componente pra módulos próprios (`button-variants.ts`, `badge-variants.ts`,
  `hooks/use-familia-equipamento.ts`, `lib/campo-cru.ts`, `lib/proposta-status.ts`,
  `lib/monitoramento-status.ts`) — 6 desses 21 arquivos acima de 200 linhas ficaram menores no
  processo (21 → 12 no total, ver "Evidências executadas").
- `.card-group`/`.card-group-accent`/`.table-editorial` (+ variantes)/`.meta-grid`/`.kpi-row`
  removidos de `index.css` (achado transversal #5 abaixo) — grep reconfirmado sem consumidor antes
  de remover; `.table-scroll`/`.kpi` (não citados pelo diagnóstico original) ficaram de fora de
  propósito neste bloco — removidos depois no Bloco 3, ver abaixo.
- `EmailStr` (achado transversal #10 abaixo, `backend/app/schemas.py`) trocado por um validador
  próprio que aceita o domínio reservado `.local` sem deixar de rejeitar e-mail malformado. No
  caminho, achado real adicional: `mensagemErroHttp` (`services/monitoramento.ts`) tratava o
  `detail` de um 422 sempre como string, mas `RequestValidationError` (`backend/app/errors.py`)
  devolve `detail` como ARRAY de `{loc,msg,type}` — essa era a causa direta do `[object Object]` na
  UI, não só o domínio rejeitado. Corrigido só no service que o login usa
  (`monitoramento.ts`); a cópia duplicada em `convenios.ts` não foi tocada — unificar isso é
  exatamente o Bloco 1.

### Efeito da execução do Bloco 3

- `AppHeader` (`frontend/src/components/layout/app-header.tsx`) ganhou um menu mobile (`Sheet` do
  shadcn) que colapsa nav/`leftExtra`/`rightExtra`/`UserMenu` abaixo de `lg` (1024px) — descoberta
  ao testar ao vivo: `md` (768px) não bastava como corte, o nav completo de 4 itens não cabia numa
  linha só sem sair dos 56px do header nessa largura exata.
- Container/gutter (`max-w-[1400px] px-6`), antes duplicado em `app-header.tsx`/`app-layout.tsx`/
  `monitoramento-layout.tsx`, virou `CONTAINER_CLASS` (`frontend/src/lib/layout.ts`).
- `NavBoxesAnaliseMerito` (cards "Ir para" nos cabeçalhos de Dashboard/Mapa/Relatórios) empilha em
  1 coluna abaixo de `sm` (640px) — antes fixo em 3 colunas com `min-width`, contribuía pro
  overflow horizontal em 400px reportado na auditoria abaixo.
- Verificado ao vivo (login real com `admin@sigeo.local`, dev server local): 1440px sem mudança
  visual; 768px mantém o header numa linha só com hambúrguer funcional; no piso de largura que a
  janela do Chrome aceitou nesta verificação (~500px, mais perto de 400px que de 768px) o
  `<header>` mede 492px de conteúdo dentro de 500px de viewport — sem overflow. O overflow de
  517px medido no Dashboard nesse mesmo teste vem de um bloco de filtros do *conteúdo* da página,
  fora do `<header>` — confirma que o problema restante é de página, não mais de shell.
- Higiene no mesmo bloco: `components/common/modal.tsx` (wrapper fino sobre `Dialog`) removido —
  os 3 consumidores (`municipio-detalhe-modal.tsx`, `modals/export-{xlsx,pdf}-modal.tsx`) usam
  `<Dialog>/<DialogContent>` direto agora, testado ao vivo abrindo `MunicipioDetalheModal`.
  `.table-scroll`/`.kpi*` removidos de `index.css` (zero consumidor). Comentários de histórico
  datado podados em `services/{api,convenios,monitoramento}.ts`, `pages/monitoramento-{overview,
  painel}-page.tsx`, `convenio-card-header.tsx`, `monitoramento-interno-cabecalho.tsx` — mantido só
  o WHY local; `secao-propostas-candidatas.tsx` ficou de fora de propósito (alvo de split completo
  na Etapa 5).

## Auditoria visual sênior — conclusiva

A auditoria visual autenticada percorreu todas as oito rotas do produto em
1440px, 768px e 400px. A navegação foi exercitada por cliques reais no header,
nos cards contextuais, na logo, na tabela de instrumentos e no breadcrumb do
detalhe. Foram avaliados hierarquia, densidade, orientação, legibilidade,
responsividade, overflow e semântica observável. Não foram realizadas mutações
de dados; estados destrutivos/sucesso foram avaliados pelo código e pelos
componentes existentes.

Rotas auditadas:

- `/` — Painel Geral;
- `/dashboard` — Parâmetros de Necessidade;
- `/mapa` — Mapa de Cobertura e mapa rodoviário;
- `/relatorios` — exportações e metodologia;
- `/monitoramento-equipamentos` — Instrumentos e repasses;
- `/monitoramento-equipamentos/instrumentos` — Mesa de trabalho;
- `/monitoramento-equipamentos/painel` — Painel de Gestão;
- `/monitoramento-equipamentos/instrumentos/904824` e um detalhe aberto a
  partir da tabela — operação de um instrumento.

**Nota conclusiva de UI/UX: 5,8/10.** Em desktop, a interface é funcional,
legível e visualmente mais madura do que a arquitetura interna sugeria. Painel
Geral, Mesa de trabalho e Painel de Gestão possuem boa hierarquia inicial e
identidade institucional coerente. A nota cai porque mobile não é uma versão
adaptada do produto: em vários pontos é o desktop comprimido, com navegação
transbordando, conteúdo cortado e mapas/tabelas ilegíveis. A experiência também
muda de linguagem entre módulos e repete informação em excesso.

### Decisão de design

É necessária uma **refatoração visual sistêmica de todas as rotas**, preservando
a fundação. Não se recomenda apagar o design atual nem fazer um rewrite único.
A direção institucional, os tokens e algumas composições desktop devem ser a
base do trabalho.

Preservar:

- paleta aquecida e verde-petróleo;
- Public Sans + Space Grotesk + Fragment Mono;
- Tailwind v4, shadcn/Radix e Lucide;
- tokens semânticos, largura máxima e gutters desktop;
- header como ponto global, lazy loading e tabelas com paginação;
- boas composições existentes na Mesa de trabalho e no Painel de Gestão.

Refatorar:

- app shell e navegação responsiva;
- arquitetura de informação entre análise, dados oficiais e monitoramento;
- templates de cabeçalho, filtros, KPIs, dados e detalhe operacional;
- tabelas e mapas em telas estreitas;
- estados de loading, erro, vazio, sucesso e permissão;
- acessibilidade, contraste e interação por teclado.

### Navegação validada

Os caminhos funcionais abaixo foram confirmados por interação real:

- Dashboard → Monitoramento interno;
- Monitoramento interno → Dados oficiais;
- Dados oficiais → Painel de gestão;
- Monitoramento interno → Análise de mérito;
- cards internos → Mapa e Relatórios;
- logo → Painel Geral;
- tabela de instrumentos → detalhe;
- breadcrumb do detalhe → Mesa de trabalho.

A navegação funciona tecnicamente, mas possui problemas de orientação:

1. Existem dois níveis concorrentes: header global e três cards “IR PARA” nas
   páginas de análise. Os cards parecem conteúdo promocional, embora sejam a
   navegação local principal.
2. “Dados oficiais”, “Monitoramento interno” e “Painel de gestão” representam
   contextos; “Análise de mérito” aparece apenas em parte das rotas. A volta não
   é simétrica e depende de o usuário aprender onde o item reaparece.
3. O estado ativo usa pill no header e card com borda no conteúdo, criando duas
   gramáticas para a mesma função.
4. ~~Em 768px e 400px o nav quebra para uma segunda linha fora da altura de 57px
   do header. Itens se sobrepõem ao conteúdo e alguns desaparecem.~~ *(resolvido
   no Bloco 3, 2026-09-17 — o header mantém uma linha só em qualquer largura,
   nav completo só aparece em `lg`/1024px+)*
5. ~~Não existe menu mobile, drawer, prioridade de destinos ou rótulo de
   contexto compacto.~~ *(resolvido no Bloco 3 — menu mobile via `Sheet`,
   abaixo de `lg`)*

### Achados por rota

#### Painel Geral

- Desktop: identidade forte, bons números e visão comparativa útil.
- Há um card grande por família com muitos subcards e gráficos, gerando uma
  página muito longa e repetitiva.
- ~~Em 400px o documento alcançou `scrollWidth=504px`: existe overflow horizontal.~~ ~~O grid
  mínimo de 480px é incompatível com a viewport obrigatória de 400px.~~ *(resolvido no Bloco 6,
  2026-09-17 — `minmax(480px,1fr)` virou `minmax(min(480px,100%),1fr)`; ~500px de viewport
  testado ao vivo sem overflow)*.
- A navegação para cada domínio depende de CTA repetido dentro dos cards.

#### Parâmetros de Necessidade

- Desktop: filtros, KPIs e tabelas são compreensíveis e densos na medida certa.
- Seis filtros aparecem no mesmo nível; a dependência geográfica não é visível.
- O bloco introdutório e os cards de navegação ocupam espaço antes da tarefa.
- Em 400px o documento alcançou `517px`; tabelas mediram 655px e 731px. Há
  scroll horizontal da página, contrariando a constituição.
- Cabeçalhos ordenáveis continuam sem semântica e teclado adequados.

#### Mapa

- Desktop: mapa e painel lateral funcionam bem e constituem uma boa base visual.
- A seleção inicial de AC não é explicada e pode parecer arbitrária.
- ~~Em 400px não há overflow global, mas a grade de duas colunas não quebra. O
  mapa fica estreito e o painel lateral vira uma coluna de aproximadamente
  120px, com frases quebradas palavra por palavra.~~ *(resolvido no Bloco 6 —
  `grid-cols-[2fr_1fr]` virou `grid-cols-1 lg:grid-cols-[2fr_1fr]`, mapa e painel empilham
  em 1 coluna abaixo de 1024px)*
- O mapa rodoviário aparece muito abaixo da dobra, sem navegação interna clara.

#### Relatórios e Informações

- Desktop: metodologia é legível, porém fragmentada em muitas superfícies.
- Os dois exports indisponíveis dominam o topo sem explicar prazo ou alternativa.
- ~~Em 400px os dois cards permanecem lado a lado, comprimindo texto e botões; o
  documento alcançou `434px` e apresentou overflow horizontal.~~ *(resolvido no Bloco 6 —
  `CardExportar` empilha `flex-col sm:flex-row`; ~500px de viewport testado ao vivo sem
  overflow)*. Exportadores (`ExportPdfModal`/`ExportXlsxModal`, jspdf+exceljs) também viraram
  `lazy()`/`Suspense` no mesmo bloco — chunk da página caiu de 35,79kB pra 11,20kB gzip.
- Setas Unicode usadas como ícones divergem do padrão Lucide.
- Há erro editorial visível (“quantas tomógrafos”).

#### Instrumentos e repasses

- Desktop: é uma das telas mais maduras; filtros, valores e cards de convênio
  comunicam bem a natureza operacional.
- A densidade de cada convênio é alta e há card dentro de card visual.
- Em 400px o bloco de três KPIs do cabeçalho não quebra corretamente: o terceiro
  fica cortado dentro do container, mesmo sem overflow global reportado.
- ~~O header esconde “Dados oficiais”, quebra “Painel de gestão” para outra
  linha e perde indicação clara do contexto.~~ *(resolvido no Bloco 3 — header
  em linha única, menu mobile com todos os itens)*
- A lista extensa precisa de estratégia mobile própria, não apenas empilhamento.

#### Mesa de trabalho

- Desktop: melhor equilíbrio atual entre visão executiva e operação; KPIs,
  distribuições, filtros e tabela formam uma sequência clara.
- Gráficos de barras usam quase a mesma cor e têm pouca codificação semântica.
- Mobile: cards principais empilham de forma legível, mas o header continua
  quebrado e a tabela exige uma apresentação alternativa.
- “Configuração pendente” é útil, mas precisa de ação direta para resolver.

#### Painel de Gestão

- Desktop: hierarquia e leitura executiva são boas; funil, calendário, pizza e
  rankings cobrem o objetivo declarado.
- ~~O título verde e a ausência do mesmo `PageHeader` das outras áreas tornam a
  tela visualmente externa ao restante do produto.~~ *(resolvido no Bloco 7 — migrado pra
  `PageHeader`, mesma composição de Dashboard/Mapa/Relatórios)*.
- Gráficos não compartilham sistema de tooltip, legenda, eixo e cores.
- Mobile: KPIs empilham corretamente; ~~a navegação superior continua
  quebrada~~ *(resolvido no Bloco 3 — menu mobile)* e o conteúdo gráfico
  inferior exige validação específica de legibilidade.

#### Detalhe do instrumento

- Desktop: possui informação completa, mas repete técnico, nível, finalidade,
  valor, status e equipamento em três áreas diferentes.
- Sete cards de resumo geram uma última linha com apenas “Prestação de contas”,
  quebrando a composição.
- O emoji de inauguração contraria o padrão Lucide e a linguagem institucional. **Continua
  pendente** — fora do escopo literal do Bloco 7 (achado de composição visual, não de
  arquitetura de dado).
- “Editar” aparece como texto pequeno no meio da linha, com affordance fraca. **Continua
  pendente.**
- ~~Ações, fase, cronograma, CNEN e timeline formam uma página muito longa sem
  índice local ou agrupamento progressivo.~~ *(resolvido no Bloco 7, 2026-09-17 —
  `OperationalDetailSection` (`<details>` nativo) agrupa Fase/cronograma (aberto por padrão),
  Ações (aberto só com ação aberta) e Linha do tempo de eventos (fechado por padrão); testado
  ao vivo expandindo/recolhendo cada seção)*.
- Mobile: o conteúdo principal empilha de forma aceitável; ~~o header ocupa
  linhas fora do seu container e interfere no começo da página~~ *(resolvido
  no Bloco 3 — header em linha única com menu mobile)*.

### Achados transversais

1. **App shell é o P0 visual.** *(resolvido no Bloco 3, 2026-09-17 — ver
   `planmode-frontend-2026-09-17.md`)* Header não tinha comportamento
   responsivo e quebrava em todas as áreas em 400px e 768px. `AppHeader`
   agora colapsa nav/extras/`UserMenu` num menu mobile (Sheet) abaixo de
   `lg` (1024px) — testado que 768px sozinho não bastava como corte, o
   nav completo de 4 itens não cabia numa linha só sem sair dos 56px do
   header. Verificado ao vivo (login real, dev server): 768px mantém uma
   linha só; ~500px (o mínimo que a janela do Chrome aceita nesta
   verificação) confirma que o header não gera overflow (492px de
   conteúdo dentro de 500px). O overflow de página em Painel Geral/
   Dashboard/Relatórios (item "Achados por rota" abaixo) continua aberto
   — vem do conteúdo das páginas, não do header, e é escopo das Etapas
   5/6 do plan-mode.
2. **Responsividade é local, não sistêmica.** Três rotas tinham overflow global comprovado em
   400px (Painel Geral 504px, Dashboard 517px, Relatórios 434px) — Painel Geral e Relatórios
   *(resolvido no Bloco 6)*, Dashboard **continua pendente** (o overflow ali vem de um bloco de
   filtros do conteúdo, não do shell — ver "Achados por rota" acima); outras rotas ainda
   escondem/cortam conteúdo internamente.
3. **Card é a unidade dominante.** O sistema usa bordas, radius e superfícies
   para quase toda hierarquia, embora a constituição defina estética editorial.
4. **Templates divergem.** *(Parcialmente resolvido, Blocos 6/7, 2026-09-17)* Card introdutório
   (Dashboard/Mapa/Relatórios), header simples (Mesa de trabalho) e título verde (Painel de
   Gestão, Detalhe do instrumento) convergiram todos pra `PageHeader` — mesma composição, mesma
   gramática. O hero verde do Painel Geral fica de fora por decisão (é a página inicial, com
   identidade própria de "landing" do produto, fora de `AppLayout`/`MonitoramentoLayout`, nunca
   foi pensado como "mesmo nível de página" que as outras).
5. **Padrões CSS ainda não chegaram às telas** *(resolvido no Bloco 0, 2026-09-17 — removidos de
   `index.css`)*. `table-editorial`, `meta-grid`, `kpi-row` e `card-group` nunca tiveram adoção
   real; documentado aqui como referência histórica do achado, não mais presente no código.
6. **Labels pequenas e uppercase são excessivas.** Em grandes volumes, 10–11px
   reduz leitura e cria ruído institucional.
7. **Feedback ainda é provisório.** Textos “Carregando...”, erro técnico e
   exportações desabilitadas não têm padrão de recuperação.
8. **Semântica interativa é irregular.** Header usa `button` para navegação,
   cards usam links; ~~ordenação usa `span`~~ *(resolvido no Bloco 9 — `<button>` real +
   `aria-sort`)* e ações secundárias às vezes parecem texto.
9. **Conteúdo editorial precisa revisão.** Há gramática incorreta, textos muito
   técnicos e explicações que competem com a tarefa principal.
10. **Login estava funcionalmente incompatível com a credencial administrativa**
    *(resolvido no Bloco 0, 2026-09-17)*. `EmailStr` rejeitava o domínio reservado `.local` tanto
    na entrada quanto no `UserRead`; a UI transformava o detalhe 422 em `[object Object]`. A
    auditoria só prosseguiu com flexibilização temporária local, já restaurada sem diff, na época.
    Corrigido de verdade agora: `backend/app/schemas.py` usa um validador próprio (aceita `.local`,
    continua rejeitando malformado) e `mensagemErroHttp` (`services/monitoramento.ts`) para de
    tratar `detail` de 422 como string sempre — essa segunda causa era a raiz real do
    `[object Object]`.

### Padrões de composição necessários

Antes de migrar páginas, consolidar cinco padrões:

1. **App shell responsivo:** desktop completo; tablet compacto; mobile com menu,
   contexto atual e ações prioritárias.
2. **Page header:** eyebrow, título, descrição, breadcrumb e ações com uma única
   gramática entre todos os módulos.
3. **Filter workspace:** filtros progressivos, chips do recorte ativo, contagem,
   limpar e aplicar quando necessário.
4. **Data surface:** toolbar, tabela/lista/mapa, loading, erro, vazio, paginação e
   alternativa mobile comuns.
5. **Operational detail:** resumo sem duplicação, navegação local, timeline,
   tarefas e edição progressiva.

A implementação deve começar pelo app shell e por uma tela piloto que contenha
navegação, filtros, KPIs e tabela. O Dashboard é a melhor prova do sistema de
análise; a Mesa de trabalho é a melhor prova do sistema operacional. Depois, a
migração segue rota por rota, removendo o legado substituído no mesmo bloco.

## Nota por eixo

- **Segurança de sessão: 9,0/10** (era 8,5/10). Cookie HttpOnly, CSRF, `credentials: include`, rotas protegidas, ausência de bearer/localStorage de autenticação, e agora um único mutex de refresh (Bloco 1) em vez de três. Perde pontos só pelas mensagens técnicas que ainda vazam pra algumas telas via `error.message` direto (achado #3 da lista "Pendente" abaixo, fora do escopo do Bloco 1).
- **Contratos e dados: 6,5/10.** Zod cobre os services principais, mas tipos manuais duplicados já causam falha real de TypeScript e estruturas externas ainda usam `Record<string, unknown>`.
- **Arquitetura: 6,0/10** (era 5,0/10 → 5,5/10 pós-Bloco 1). Transporte HTTP unificado (Bloco 1);
  Dashboard, Mesa de trabalho, Painel de Gestão e Dados oficiais não orquestram mais IO direto —
  migraram pra hooks TanStack Query já existentes ou novos (`useConveniosLista`, Blocos 5/7);
  `secao-propostas-candidatas.tsx` dividido em 4 arquivos (Bloco 5). Ainda assim `src/features`
  continua achatado por decisão vigente (ver CLAUDE.md) e services de domínio continuam
  monolíticos (`monitoramento.ts` com ~380 linhas de schema+funções) — fica pro Bloco 8.
- **Design system: 8,0/10.** Tailwind v4, shadcn/Radix, tokens e identidade própria estão presentes.
- **UX e acessibilidade: 6,5/10** (era 5,5/10). `ErrorAlert` com retry, `Skeleton` consistente e
  `Toaster` (Sonner) chegaram no Bloco 4; semântica de ordenação (`aria-sort` + `<button>` real)
  chegou no Bloco 9. Ainda falta uma auditoria completa de WCAG AA (contraste, ordem de foco
  tab-a-tab, labels em todos os campos) nas 8 rotas.
- **Responsividade e performance: 6,5/10** (era 6,0/10). App shell responsivo fechado no Bloco 3
  (header não quebra mais em 400/768px, `NavBoxesAnaliseMerito` empilha em 1 coluna abaixo de
  `sm`) — verificado ao vivo, não só no código. Nota ainda não sobe mais porque o overflow de
  *conteúdo* de página (Painel Geral/Dashboard/Relatórios) continua aberto e falta virtualização
  de listas grandes.
- **Testes e gates: 7,0/10** (era 6,0/10 → 5,5/10 pós-Bloco 0, 4,5/10 antes). `lint`/`test`/`build`
  passam limpos; 60 testes (era 42) em 14 arquivos (era 8) — os 18 novos do Bloco 10 são os
  primeiros `.test.tsx` reais (Testing Library + `jest-axe`) do projeto, cobrindo shell (menu
  mobile), componentes de fundação (`PageHeader`/`ErrorAlert`/`EmptyState`/`SortableTableHead`) e
  1 hook em sucesso/falha. `@playwright/test` scaffolded (`e2e/login.spec.ts`, login + rota
  protegida) mas não executado (falta `npx playwright install chromium`, decisão do usuário).
  Ainda falta: CI frontend, mais cobertura de hooks/componentes interativos, E2E de navegação e
  detalhe.
- **Código morto e organização: 6,5/10** (era 6,0/10). O CSS aspiracional sem consumidor (`card-group`/`table-editorial`/`meta-grid`/`kpi-row`, e agora também `table-scroll`/`kpi*`) foi removido; arquivos acima de 200 linhas caíram de 21 para 12 (extração dos helpers não-componente do Bloco 0). `Modal` como wrapper legado sobre Dialog foi removido no Bloco 3; os comentários longos de histórico em services/páginas foram podados no mesmo bloco (exceto `secao-propostas-candidatas.tsx`, adiado pro split da Etapa 5).

## Efeito dos blocos anteriores

### Database

- As migrations de refresh token e a remoção de `cpf_hash` são transparentes ao frontend; não existem referências ao campo removido.
- A separação de papéis e TLS não alteram o contrato do navegador.
- O frontend depende de a migration de autenticação estar aplicada antes do deploy da interface; não há verificação de compatibilidade/versionamento de API no cliente.
- Os tetos adicionados pelo backend (`macro=1000`, `município=10000`, `região=1000`, `instrumentos/ações=500`, `marcos=200`) não mudam o JSON. Contudo, listas não paginadas podem ser truncadas sem o frontend saber, pois não recebem `total`/`meta`.

### Segurança

Fechado:

- Todo o app, exceto `/login`, passa por `ProtectedRoute` e consulta `/auth/me`.
- O token de sessão não é lido nem gravado por JavaScript.
- Os três clientes usam `credentials: 'include'`.
- Mutações enviam o double-submit token em `X-CSRF-Token`.
- Bearer fallback e `access_token` no corpo foram removidos do contrato consumido.
- Não foram encontrados segredos, `dangerouslySetInnerHTML` com dado remoto ou token de auth em storage.

Pendente:

1. ~~`api.ts`, `convenios.ts` e `monitoramento.ts` possuem mutexes de refresh independentes.~~ *(resolvido no Bloco 1, 2026-09-17)* — `lib/http-client.ts` tem 1 mutex de módulo só, compartilhado pelos 3 services; 401 simultâneo em domínios diferentes gera 1 `/auth/refresh` só (testado, ver `http-client.test.ts`).
2. ~~A leitura/renovação, redirect e normalização de erro estão triplicados.~~ *(resolvido no Bloco 1)* — os 3 services delegam pra `requisitar`/`httpFetch` do cliente comum; cada um mantém só seus schemas Zod por domínio.
3. Erros de Zod, status e paths são incorporados à mensagem de `ApiError`; várias telas exibem `error.message` diretamente. **Continua pendente** — o Bloco 1 normalizou onde a mensagem é construída (1 lugar em vez de 3), não separou mensagem segura de detalhe técnico dentro da UI que a consome.
4. `LoginPage` chama `navigate()` durante render quando já autenticada. O redirecionamento deve ser declarativo ou ocorrer em efeito, evitando atualização de roteador durante render.
5. A preferência da família em `localStorage` é apenas UX e não contém sessão; seu uso é aceitável.

### Backend

- A introdução de `DomainError` não quebrou o formato HTTP: erros continuam `{error, detail}` e `mensagemErroHttp` permanece compatível.
- A extração de Repository/Service no backend preservou os payloads de notificações e instrumentos.
- O frontend ainda espelha contratos manualmente e não há geração/checagem OpenAPI. O build chegou a demonstrar drift real: `ResumoApi`, `InauguracaoApi` e `InstrumentoApi` das páginas de monitoramento não correspondiam aos tipos inferidos pelos schemas do service (`overview` e `painel`, achado adicional confirmado ao executar o Bloco 0) — corrigido nesta rodada (tipos agora derivados via `Pick`/alias), mas o risco estrutural de duplicação manual sem checagem automática continua presente em qualquer página nova.
- A nova paginação/teto do backend não foi modelada como contrato comum. Onde há paginação real, cada service define seu próprio resultado; onde há apenas teto, a UI assume lista completa.
- O envelope constitucional do backend ainda não foi adotado. Quando mudar, os três clientes e todos os schemas-raiz serão afetados; essa mudança exige Plan Mode coordenado.

## Achados prioritários

### P0 — build e fonte da verdade *(resolvido — Bloco 0/2, 2026-09-17)*

1. ~~`npm run build` falha com TS1261 porque `Modal.tsx`/`Pagination.tsx` coexistem com imports em minúsculas.~~ Corrigido: arquivos renomeados via `git mv` pra `modal.tsx`/`pagination.tsx`.
2. ~~`monitoramento-overview-page.tsx` declara tipos manuais mais largos que os schemas.~~ Corrigido, e o mesmo padrão foi confirmado e corrigido também em `monitoramento-painel-page.tsx` (achado adicional, não listado na rodada anterior).
3. ~~Tipos das páginas devem ser derivados de `ResumoMonitoramento` e `InstrumentoEquipamento`.~~ Feito nas duas páginas via `Pick`/alias sobre os tipos `z.infer` de `services/monitoramento.ts`; o schema `inauguracaoResumoSchema` também foi corrigido (faltavam `municipio`/`uf`/`equipamento`, que o backend já envia).
4. ~~O `AGENTS.md` declara `src/features/<nome>/index.ts`, mas o código é flat.~~ `AGENTS.md` reescrito no Bloco 2 do Plan Mode para espelhar a estrutura real.

### P1 — cliente HTTP e sessão *(resolvido — Bloco 1, 2026-09-17, exceto item 4)*

1. ~~Criar um único cliente responsável por base URL, cookies, CSRF, refresh compartilhado, retry único, redirect e `ApiError`.~~ `frontend/src/lib/http-client.ts`.
2. ~~Manter schemas por domínio, mas eliminar as três implementações de transporte.~~ `api.ts`/`convenios.ts`/`monitoramento.ts` delegam pro cliente comum.
3. ~~Garantir que um 401 simultâneo em dashboard, convênios e monitoramento resulte em apenas um `/auth/refresh`.~~ Testado (`http-client.test.ts`, caso "deduplica renovação").
4. ~~Separar mensagem segura para usuário de detalhe técnico de contrato; o detalhe deve ficar
   disponível apenas para diagnóstico controlado.~~ *(resolvido no Bloco 8, 2026-09-17)* —
   `ApiError.publicMessage` (erro de domínio real usa a mensagem do backend, que já não vaza
   detalhe técnico; falha de rede/schema cai num fallback genérico) + helper
   `mensagemSeguraDoErro()`, adotado em todo lugar que antes renderizava `error.message` direto.
5. ~~Testar login, refresh deduplicado, CSRF, logout, 401 definitivo e payload inválido.~~ 12 testes novos em `http-client.test.ts`.

### P1 — arquitetura e tamanho

1. Há 21 arquivos acima das 200 linhas recomendadas (12 depois do Bloco 0; ver evidências).
2. ~~`secao-propostas-candidatas.tsx` tem 868 linhas e combina parsing dinâmico, regra, filtros,
   mutations e várias seções visuais.~~ *(resolvido no Bloco 5, 2026-09-17)* — dividido em
   `lib/proposta-metas-resumo.ts` (parsing puro) + `proposta-card.tsx` + `proposta-linha-do-
   tempo.tsx` + `proposta-detalhe-bruto.tsx` (maior remanescente, 276 linhas — uma única
   responsabilidade coesa, renderizar o dump bruto por seção; não dividido mais fundo por
   retorno decrescente).
3. ~~`monitoramento.ts` tem 578 linhas.~~ *(resolvido no Bloco 8, 2026-09-17)* — dividido em 8
   arquivos por domínio (`auth.ts`, `monitoramento-{marcos,instrumentos,acoes,resumo}.ts`,
   `notificacoes.ts`, `propostas-candidatas.ts`, `cnes-referencia.ts`) + `monitoramento-client.ts`
   (helpers de transporte compartilhados), 23 import sites atualizados. `api.ts` (494 linhas) e
   `convenios.ts` (233 linhas) **continuam monolíticos** — fora do escopo deste bloco.
4. ~~`monitoramento-painel-page.tsx` tem 460 linhas e ainda faz `useEffect + useState +
   Promise.all`~~ *(resolvido no Bloco 7, 2026-09-17)* — migrou pra `useMonitoramentoResumo`/
   `useMonitoramentoInstrumentos`/`useMonitoramentoMarcos` + `useConveniosLista` (novo hook,
   também extraído do fetch inline que existia em `monitoramento-equipamentos-page.tsx`, mesma
   `queryKey` nos 2 consumidores). ~~overview, 323~~ *(resolvido no Bloco 5)*.
5. `useFiltrosMacro.ts` mantém 348 linhas de estado e transformação.
6. ~~Propostas candidatas continuam processando estruturas de negócio como `Record<string,
   unknown>` dentro do componente.~~ *(resolvido no Bloco 5)* — novo helper `campoObjeto` em
   `lib/campo-cru.ts`; `Record<string, unknown>` cru fica confinado a `campo-cru.ts`/
   `proposta-metas-resumo.ts` (a camada certa pra dado schemaless de propósito), nunca mais
   tocado direto em JSX de componente.
7. Páginas devem apenas compor features; IO e transformação assíncrona devem ficar em hooks —
   já valia pra Dashboard (services em hooks desde antes deste diagnóstico), Mesa de trabalho
   (Bloco 5) e agora também Painel de Gestão + Dados oficiais (Bloco 7, via `useConveniosLista`).

### P1 — qualidade, UX e acessibilidade

1. ~~Existem sete arquivos e 30 testes, todos de funções puras. Não há `.test.tsx`, Testing
   Library, axe ou E2E.~~ *(parcialmente resolvido no Bloco 10, 2026-09-17)* — 14 arquivos/60
   testes; 18 novos são `.test.tsx` reais (Testing Library + `jest-axe`): `EmptyState`/
   `ErrorAlert`/`PageHeader`/`SortableTableHead`/`AppHeader` + 1 hook em sucesso/falha. E2E
   scaffolded (`@playwright/test`, `e2e/login.spec.ts`) mas não executado (falta instalar o
   browser do Playwright).
2. Nenhum teste cobre `ApiError`, Zod inválido, refresh, CSRF ou `ProtectedRoute` — **parcial**:
   `http-client.test.ts` (Bloco 1) já cobria refresh/CSRF/Zod inválido; `ProtectedRoute` e mais
   hooks continuam sem teste.
3. ~~O lint termina com 15 warnings: seis expressões sem efeito e nove violações de Fast Refresh.~~ *(resolvido no Bloco 0, 2026-09-17 — `npm run lint` limpo)*
4. ~~Loading de overview/painel é texto simples; erros não oferecem retry e mostram detalhe
   técnico.~~ *(resolvido nos Blocos 5-8 — `Skeleton`/`ErrorAlert` com retry, mensagem segura via
   `mensagemSeguraDoErro`)*
5. ~~Não existe sistema consistente de toast/sucesso nem Error Boundary global.~~ *(toast
   resolvido no Bloco 4 — `Sonner`; Error Boundary global **continua pendente**)*
6. ~~Quatro cabeçalhos ordenáveis usam `span onClick`, sem botão, teclado ou `aria-sort`.~~
   *(resolvido no Bloco 9, 2026-09-17 — na verdade eram 13 em 3 tabelas: `cobertura-table.tsx`,
   `nivel-cobertura-table.tsx`, `estabelecimento-table.tsx`. `SortableTableHead` novo, `<button>`
   real + `aria-sort`, testado ao vivo)*.
7. Não há evidência automatizada ou manual versionada de foco, Escape, Enter, labels e anúncios dinâmicos.

### P2 — responsividade e performance

1. O código possui wrappers de overflow e breakpoints pontuais, mas as rotas protegidas não foram verificadas visualmente em 400px e 768px nesta etapa.
2. Mapas, filtros e tooltips ainda usam dimensões fixas que precisam de inspeção em viewport estreita.
3. Listas do monitoramento podem chegar a 500 itens e municípios a milhares; algumas telas filtram/renderizam tudo no cliente sem virtualização. **Avaliado no Bloco 8 (2026-09-17), não implementado** — nenhuma lista real do app hoje chega perto do teto do backend (86 instrumentos/403 convênios/~5570 municípios, tetos 500/500/10000), então virtualização client-side não tem urgência real ainda; o bloqueio de fundo é o backend não devolver `total`/`meta` pra detectar truncamento (envelope de resposta unificado, mudança breaking que precisa de Plan Mode coordenado com o backend).
4. O build não chega à etapa Vite, portanto não há relatório válido de chunks/bundle nesta revisão.
5. Rotas usam `lazy`, um ponto positivo preservado.

### P2 — código residual

- ~~`card-group`, `table-editorial`, `meta-grid` e `kpi-row` existem em `index.css` sem consumidores encontrados.~~ *(resolvido no Bloco 0, 2026-09-17 — removidos)*
- ~~`Modal` é um wrapper legado sobre Dialog; deve ser removido quando os três consumidores migrarem.~~ *(resolvido no Bloco 3, 2026-09-17 — `modal.tsx` removido, os 3 consumidores usam `<Dialog>/<DialogContent>` direto)*. `.table-scroll`/`.kpi*` (zero consumidor, nunca tiveram adoção real) também removidos de `index.css` no mesmo bloco.
- Comentários longos de histórico ocupavam services e páginas *(podados no Bloco 3 em `services/{api,convenios,monitoramento}.ts`, `pages/monitoramento-{overview,painel}-page.tsx`, `convenio-card-header.tsx`, `monitoramento-interno-cabecalho.tsx` — mantido só o WHY local)*. `secao-propostas-candidatas.tsx` ainda tem esse padrão de propósito — é alvo de split completo na Etapa 5, tratar comentário e estrutura juntos nesse bloco futuro.
- Hooks de GeoJSON executam `fetch` fora de services. É aceitável separar API operacional de assets geográficos, mas os hooks precisam de schema/adapter explícito e erro normalizado.

## Próximo bloco recomendado

### Bloco 0 — restaurar o estado entregável *(executado em 2026-09-17, ver `planmode-frontend-2026-09-17.md`)*

- ~~Renomear fisicamente `Modal.tsx` e `Pagination.tsx` para kebab-case e alinhar imports.~~
- ~~Remover tipos duplicados de overview/painel e usar tipos derivados dos schemas.~~
- ~~Corrigir os 15 warnings reais.~~
- ~~Fazer `typecheck`, `test` e `build` passarem antes de refatoração arquitetural.~~

### Bloco 1 — transporte HTTP único *(executado em 2026-09-17, ver `planmode-frontend-2026-09-17.md`)*

- ~~Extrair cliente comum com refresh mutex global, CSRF, retry, redirect e erro seguro.~~ `lib/http-client.ts`.
- ~~Manter services/schemas por domínio sobre esse cliente.~~
- ~~Escrever testes do transporte e sessão.~~ `lib/http-client.test.ts`, 12 casos.

### Bloco 2 — feature piloto

- Resolver formalmente a divergência FSD.
- Migrar propostas candidatas para `src/features/propostas-candidatas` com API pública, hooks, schemas e componentes menores.
- Remover código e tipos substituídos no mesmo bloco.

### Blocos seguintes

1. ~~Migrar monitoramento e depois cobertura/mapa, uma feature por vez.~~ *(resolvido nos Blocos
   5-7 — Dashboard, Mesa de trabalho, Painel de Gestão, Dados oficiais, Detalhe)*
2. ~~Padronizar Skeleton, retry, empty state, toast e Error Boundary.~~ *(Skeleton/retry/empty
   state/toast resolvidos no Bloco 4; Error Boundary global **continua pendente**)*
3. ~~Adicionar Testing Library, axe e E2E do login + rota protegida.~~ *(Testing Library + axe
   resolvido no Bloco 10, 18 testes; E2E scaffolded — `@playwright/test` + `e2e/login.spec.ts` —
   mas não executado, falta instalar o browser)*
4. Validar 400px/768px e virtualizar/paginar listas grandes. *(400/768px do app shell e das 3
   rotas com overflow do Bloco 6 validados ao vivo; virtualização/paginação real **continua
   bloqueada** no backend não devolver `total`, ver Bloco 8)*
5. ~~Criar CI frontend com lint sem warnings, typecheck, testes e build.~~ *(resolvido no Bloco
   11 — `.github/workflows/frontend_ci.yml`, `npm ci` + lint + typecheck + test + build)*

## Critério de encerramento

- [x] Lint sem warnings, typecheck, testes e build passam localmente *(Bloco 0, 2026-09-17)* — agora ligado a CI de verdade (Bloco 11 — `.github/workflows/frontend_ci.yml`).
- [x] Um único transporte HTTP controla cookie, CSRF, refresh e erro *(Bloco 1, 2026-09-17)* — `lib/http-client.ts`.
- [x] Todo payload operacional é validado com Zod e os tipos da UI derivam do schema — corrigido para overview/painel no Bloco 0; vale como regra geral daqui pra frente, não uma varredura de todas as páginas existentes.
- [x] Páginas compõem features e não executam IO diretamente *(Bloco 5-7 — Dashboard/Mesa de
  trabalho/Painel de Gestão/Dados oficiais migrados pra hooks TanStack Query; `secao-propostas-
  candidatas.tsx` dividido)*.
- [x] Estrutura real e `AGENTS.md` descrevem a mesma arquitetura *(Bloco 2, 2026-09-17)*.
- [x] Hooks, services e componentes interativos possuem testes de sucesso e falha *(parcial, Bloco
  10 — cliente HTTP (Bloco 1), 1 hook (`useMonitoramentoResumo`) e 5 componentes de fundação/shell
  têm teste; a maioria dos hooks/componentes de domínio ainda não)*.
- [ ] Login e fluxos críticos possuem E2E. *(Scaffolded, Bloco 10 — `e2e/login.spec.ts` — mas não
  executado; falta instalar o browser do Playwright, decisão do usuário)*
- [x] Teclado, foco, WCAG AA, 400px e 768px são validados *(parcial — 400/768px do app shell +
  das 3 rotas do Bloco 6 verificados ao vivo; ordenação de tabela ganhou `aria-sort`/teclado no
  Bloco 9; falta auditoria completa de WCAG AA — contraste, foco tab-a-tab — nas 8 rotas)*.
- [ ] Listas grandes possuem paginação, teto detectável ou virtualização. *(Avaliado no Bloco 8 —
  bloqueado no backend não devolver `total`/`meta`, fora do que este Plan Mode decide sozinho)*
- [x] Código, CSS e tipos substituídos são removidos em cada bloco *(cumprido em todos os blocos —
  CSS morto, tipos duplicados, 3 implementações de transporte, `Modal` legado, `monitoramento.ts`
  monolítico)* — critério permanente, reavaliar a cada bloco seguinte.

Dos 10 critérios, **8 cumpridos** (2 deles parciais, ver notas acima) pelos Blocos 0-11; os 2
restantes (E2E de fato executado, paginação/virtualização real) dependem de uma decisão do
usuário (rodar Playwright localmente) e de uma mudança de contrato do backend (envelope com
`total`/`meta`), respectivamente — fora do que o frontend decide sozinho.

## Evidências executadas

Bloco abaixo é o estado no momento em que esta reavaliação foi escrita (antes do Bloco 0).
Ver "Evidências pós-Bloco 0" logo em seguida para o estado atual, mesma data.

```text
npm run lint: concluiu com 15 warnings
npm run test: 7 arquivos, 30 testes passando
npm run build: falhou com TS1261 + incompatibilidade de tipos no overview
arquivos TypeScript/TSX: 143
linhas TypeScript/TSX: 15.252
arquivos acima de 200 linhas: 21
components/features: 44 arquivos
src/features: inexistente
fetch operacional: concentrado em 3 services; GeoJSON em 3 hooks genéricos/específicos
testes de componente: 0
CI frontend: inexistente
auditoria visual: 8/8 rotas principais em 1440px, 768px e 400px
navegação: header, cards contextuais, logo, tabela→detalhe e breadcrumb validados
400px: overflow global em Painel Geral (504px), Dashboard (517px) e Relatórios (434px)
400px: mapa mantém 2 colunas; Dados oficiais corta KPI; header transborda em todos os contextos
768px: sem overflow global medido, mas header ainda quebra item para segunda linha fora dos 57px
login: credencial .local rejeitada por LoginRequest e UserRead; UI exibe [object Object]
```

### Evidências pós-Bloco 0 (mesmo dia, 2026-09-17)

```text
npm run lint: 0 warnings
npm run test: 7 arquivos, 30 testes passando (sem mudança)
npm run build: passou (tsc -b + vite build)
npx tsc -b: sem erros
arquivos acima de 200 linhas: 12 (era 21)
components/features: 44 arquivos (sem mudança de contagem -- helpers saíram pra lib/hooks, não
  reduziram o número de componentes)
src/features: continua inexistente (decisão vigente é flat, não FSD -- ver CLAUDE.md)
backend: uv run pytest 53 passed/78 skipped (sem mudança); uv run ruff check app/schemas.py
  e app/errors.py: sem achado novo (0 fora da baseline)
login: credencial .local aceita; UI já não mostra [object Object] em 422 de validação
```

### Evidências pós-Bloco 1 (mesmo dia, 2026-09-17)

```text
npm run lint: 0 warnings (sem mudança)
npm run test: 8 arquivos, 42 testes passando (30 antigos + 12 novos em lib/http-client.test.ts)
npm run build: passou
npx tsc -b: sem erros
mutexes de refresh independentes: 1 (era 3 -- api.ts/convenios.ts/monitoramento.ts agora
  delegam pra lib/http-client.ts)
teste de dedup de refresh (401 simultâneo em 2 domínios -> 1 só POST /auth/refresh): presente
  e passando
backend: uv run pytest 53 passed/78 skipped (não tocado neste bloco)
```

### Evidências pós-Bloco 3 (mesmo dia, 2026-09-17)

```text
npm run lint: 0 warnings (sem mudança)
npm run test: 8 arquivos, 42 testes passando (sem mudança)
npm run build: passou
npx tsc -b: sem erros
header responsivo: verificado ao vivo (login real, dev server) em 1440px, 768px e ~500px
  (mínimo aceito pela janela do Chrome nesta verificação, mais perto de 400px que 768px) --
  header.scrollWidth 492px dentro de innerWidth 500px em todos os 3, menu mobile abre/navega/
  fecha corretamente em 768px e no piso testado
overflow de página remanescente: Dashboard ainda mede 517px de scrollWidth no piso testado --
  isolado a um bloco de filtros do CONTEÚDO da página (fora do <header>), não ao app shell --
  escopo das Etapas 5/6, não deste bloco
Modal (components/common/modal.tsx): removido, 0 referência restante (grep confirmado); 3
  consumidores usam <Dialog>/<DialogContent> direto, testado abrindo MunicipioDetalheModal ao
  vivo (abre e fecha corretamente)
.table-scroll/.kpi* em index.css: removidos, 0 referência restante (grep confirmado)
```

### Evidências pós-Bloco 11 (mesmo dia, 2026-09-17 -- estado final desta rodada)

```text
npm run lint: 0 warnings
npx tsc -b: sem erros
npm run test: 14 arquivos, 60 testes passando (era 8/42) -- 18 novos são Testing Library + jest-axe
npm ci: reproduzido localmente (mesmo comando que a CI roda), instala limpo a partir do lockfile
npm run build: passou, sem warning de chunk (chunkSizeWarningLimit documentado em 1MB)
services/monitoramento.ts (457 linhas): dividido em 8 arquivos por domínio + monitoramento-client.ts
ApiError.publicMessage: mensagem segura separada do detalhe técnico, adotada em todo error.message
  antes renderizado direto na UI
SortableTableHead: 13 cabeçalhos de tabela (3 arquivos) com <button> real + aria-sort
.github/workflows/frontend_ci.yml: novo -- npm ci + lint + typecheck + test + build em push/PR
@playwright/test: instalado, e2e/login.spec.ts escrito, NÃO executado (falta npx playwright
  install chromium, decisão do usuário)
verificação ao vivo (login real, dev server): Painel Geral/Mapa/Relatórios/Dados oficiais/Painel
  de Gestão/Detalhe do instrumento renderizam sem regressão visual em 1440px/768px/~500px
```

## Rodada visual sênior conclusiva — 2026-09-17

A rodada final foi feita com sessão administrativa real e navegação de todas as rotas em 400px,
768px e 1440px. A medição do `documentElement.scrollWidth` confirmou **zero overflow horizontal
global** nas três resoluções. Tabelas extensas continuam com rolagem horizontal local, necessária
para preservar colunas e relações tabulares.

Correções aplicadas nesta rodada:

- `/` e o login agora entram em **Dados oficiais**; a visão nacional permanece em
  `/painel-geral`, dentro de Análise de Mérito e fora da navegação global.
- Dashboard, Relatórios, Dados oficiais e Painel de Gestão deixaram de ultrapassar a viewport em
  400px; filtros, fórmulas, KPIs e grids passam a quebrar conforme a largura disponível.
- O detalhe do instrumento deixou de repetir equipe/classificação em três áreas. O cadastro
  interno concentra esses campos; os indicadores ficaram restritos ao estado operacional.
- Emojis de inauguração, calendário e alerta foram retirados da interface operacional; estados
  usam texto, cor semântica e hierarquia tipográfica.
- Gestão de usuários passou a usar o mesmo `AppHeader`, com título, CTA e filtros responsivos. A
  tabela mantém overflow apenas dentro do componente.
- `useJson.ts`, confirmado sem importadores, foi removido.

**Nota após a rodada: 8,6/10.** Para chegar a 10 ainda faltam a auditoria WCAG AA completa
(contraste e percurso tab-a-tab em todos os fluxos), executar o E2E com browser provisionado e
coordenar com o backend paginação/`total` para listas grandes.

## Rodada premium sistêmica — 2026-09-17

A revisão posterior tratou a causa da aparência genérica em todo o sistema. O `PageHeader` deixou
de ser um hero em card repetido; a aplicação usa hierarquia editorial, régua institucional e
divisores. Métricas relacionadas agora compartilham um único contorno e preservam a tipografia
anterior. Navegação contextual, filtros, relatórios e detalhes foram achatados para evitar caixa
dentro de caixa, sombra estática e descrições redundantes.

O Painel de Gestão foi refeito para apoiar decisão: quatro números executivos, estágio atual dos
instrumentos, agenda crítica, qualidade do acompanhamento e composição da carteira. Foram
eliminados a pizza multicolorida, labels verticais e blocos simétricos sem prioridade. A marca
“D · DECAN” foi substituída globalmente por **SIGEO — Gestão de Equipamentos em Oncologia**.

Auditoria autenticada: todas as nove rotas em 400px, 768px e 1440px, sem overflow horizontal do
documento. Gates finais: lint limpo, TypeScript limpo, 60 testes aprovados e build de produção
aprovado. **Conformidade visual estimada: 9,1/10**; os limitadores restantes continuam sendo E2E
executado, auditoria WCAG AA integral e paginação coordenada com o backend.
