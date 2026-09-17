# Reavaliação da Constituição Frontend — 2026-09-17

## Escopo e método

Esta reavaliação substitui a fotografia de 2026-09-16. Ela confronta o frontend atual com `padroes/frontend/constiuicao_frontend.md` e considera os efeitos já implantados nos blocos de database, segurança e backend.

Foram inspecionados arquitetura, autenticação, contratos Zod, chamadas HTTP, estado remoto, UX, acessibilidade, responsividade, performance, testes e código residual. Os gates `lint`, `test` e `build` foram executados no estado atual do workspace. Nenhum código de produto foi alterado nesta etapa.

## Resultado executivo

**Conformidade frontend: 6,4/10** (diagnóstico anterior: 6,2/10).

A segurança da sessão evoluiu de forma relevante: todo o aplicativo está protegido, o JWT saiu do `localStorage`, cookies usam `HttpOnly`, os clientes enviam credenciais e o token CSRF acompanha mutações. As respostas principais continuam validadas com Zod e erros passam por `ApiError`.

A aplicação, porém, ainda não está entregável. O build falha por dois grupos independentes: casing duplicado de `Modal/Pagination` e tipos manuais das páginas de monitoramento incompatíveis com os tipos derivados dos schemas. A estrutura FSD descrita no `AGENTS.md` também não corresponde ao código: existem 44 arquivos em `components/features` e nenhum `src/features`.

Os blocos anteriores tornaram mais urgente unificar o cliente HTTP. Cada um dos três services mantém seu próprio refresh mutex; chamadas simultâneas entre domínios podem iniciar rotações concorrentes. Os novos limites de segurança do backend preservam o formato atual, mas são tetos silenciosos e o frontend não recebe `total` para detectar truncamento.

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
4. Em 768px e 400px o nav quebra para uma segunda linha fora da altura de 57px
   do header. Itens se sobrepõem ao conteúdo e alguns desaparecem.
5. Não existe menu mobile, drawer, prioridade de destinos ou rótulo de contexto
   compacto.

### Achados por rota

#### Painel Geral

- Desktop: identidade forte, bons números e visão comparativa útil.
- Há um card grande por família com muitos subcards e gráficos, gerando uma
  página muito longa e repetitiva.
- Em 400px o documento alcançou `scrollWidth=504px`: existe overflow horizontal.
- O grid mínimo de 480px é incompatível com a viewport obrigatória de 400px.
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
- Em 400px não há overflow global, mas a grade de duas colunas não quebra. O
  mapa fica estreito e o painel lateral vira uma coluna de aproximadamente
  120px, com frases quebradas palavra por palavra.
- O mapa rodoviário aparece muito abaixo da dobra, sem navegação interna clara.

#### Relatórios e Informações

- Desktop: metodologia é legível, porém fragmentada em muitas superfícies.
- Os dois exports indisponíveis dominam o topo sem explicar prazo ou alternativa.
- Em 400px os dois cards permanecem lado a lado, comprimindo texto e botões; o
  documento alcançou `434px` e apresentou overflow horizontal.
- Setas Unicode usadas como ícones divergem do padrão Lucide.
- Há erro editorial visível (“quantas tomógrafos”).

#### Instrumentos e repasses

- Desktop: é uma das telas mais maduras; filtros, valores e cards de convênio
  comunicam bem a natureza operacional.
- A densidade de cada convênio é alta e há card dentro de card visual.
- Em 400px o bloco de três KPIs do cabeçalho não quebra corretamente: o terceiro
  fica cortado dentro do container, mesmo sem overflow global reportado.
- O header esconde “Dados oficiais”, quebra “Painel de gestão” para outra linha
  e perde indicação clara do contexto.
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
- O título verde e a ausência do mesmo `PageHeader` das outras áreas tornam a
  tela visualmente externa ao restante do produto.
- Gráficos não compartilham sistema de tooltip, legenda, eixo e cores.
- Mobile: KPIs empilham corretamente; a navegação superior continua quebrada e
  o conteúdo gráfico inferior exige validação específica de legibilidade.

#### Detalhe do instrumento

- Desktop: possui informação completa, mas repete técnico, nível, finalidade,
  valor, status e equipamento em três áreas diferentes.
- Sete cards de resumo geram uma última linha com apenas “Prestação de contas”,
  quebrando a composição.
- O emoji de inauguração contraria o padrão Lucide e a linguagem institucional.
- “Editar” aparece como texto pequeno no meio da linha, com affordance fraca.
- Ações, fase, cronograma, CNEN e timeline formam uma página muito longa sem
  índice local ou agrupamento progressivo.
- Mobile: o conteúdo principal empilha de forma aceitável, mas o header ocupa
  linhas fora do seu container e interfere no começo da página.

### Achados transversais

1. **App shell é o P0 visual.** Header não tem comportamento responsivo e
   quebra em todas as áreas em 400px; também quebra em 768px.
2. **Responsividade é local, não sistêmica.** Três rotas têm overflow global
   comprovado em 400px; outras escondem/cortam conteúdo internamente.
3. **Card é a unidade dominante.** O sistema usa bordas, radius e superfícies
   para quase toda hierarquia, embora a constituição defina estética editorial.
4. **Templates divergem.** Hero verde, card introdutório, header simples e título
   verde representam o mesmo nível de página de quatro maneiras.
5. **Padrões CSS ainda não chegaram às telas.** `table-editorial`, `meta-grid`,
   `kpi-row` e `card-group` continuam sem adoção real.
6. **Labels pequenas e uppercase são excessivas.** Em grandes volumes, 10–11px
   reduz leitura e cria ruído institucional.
7. **Feedback ainda é provisório.** Textos “Carregando...”, erro técnico e
   exportações desabilitadas não têm padrão de recuperação.
8. **Semântica interativa é irregular.** Header usa `button` para navegação,
   cards usam links, ordenação usa `span` e ações secundárias às vezes parecem
   texto.
9. **Conteúdo editorial precisa revisão.** Há gramática incorreta, textos muito
   técnicos e explicações que competem com a tarefa principal.
10. **Login está funcionalmente incompatível com a credencial administrativa.**
    `EmailStr` rejeita o domínio reservado `.local` tanto na entrada quanto no
    `UserRead`; a UI transforma o detalhe 422 em `[object Object]`. A auditoria
    só prosseguiu com flexibilização temporária local, já restaurada sem diff.

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

- **Segurança de sessão: 8,5/10.** Cookie HttpOnly, CSRF, `credentials: include`, rotas protegidas e ausência de bearer/localStorage de autenticação. Perde pontos pela renovação duplicada entre services e mensagens técnicas na UI.
- **Contratos e dados: 6,5/10.** Zod cobre os services principais, mas tipos manuais duplicados já causam falha real de TypeScript e estruturas externas ainda usam `Record<string, unknown>`.
- **Arquitetura: 5,0/10.** Hooks e services existem, porém as features estão achatadas, páginas ainda orquestram IO e services são monolíticos.
- **Design system: 8,0/10.** Tailwind v4, shadcn/Radix, tokens e identidade própria estão presentes.
- **UX e acessibilidade: 5,5/10.** Há estados básicos, mas faltam retry, Skeleton consistente, toast, semântica de ordenação e testes de teclado/foco.
- **Responsividade e performance: 6,0/10.** Lazy loading por rota e alguns layouts fluidos; faltam evidência visual nos breakpoints e virtualização de listas grandes.
- **Testes e gates: 4,5/10.** Trinta testes puros passam, mas build falha, lint tem 15 warnings, não há testes React/E2E/cobertura nem CI frontend.
- **Código morto e organização: 5,5/10.** CSS aspiracional e componentes antigos permanecem; 21 arquivos ultrapassam 200 linhas.

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

1. `api.ts`, `convenios.ts` e `monitoramento.ts` possuem mutexes de refresh independentes. Requisições 401 simultâneas em services diferentes podem disparar mais de uma rotação e produzir logout/redirecionamento intermitente.
2. A leitura/renovação, redirect e normalização de erro estão triplicados. Correções de segurança precisam ser replicadas manualmente em três lugares.
3. Erros de Zod, status e paths são incorporados à mensagem de `ApiError`; várias telas exibem `error.message` diretamente.
4. `LoginPage` chama `navigate()` durante render quando já autenticada. O redirecionamento deve ser declarativo ou ocorrer em efeito, evitando atualização de roteador durante render.
5. A preferência da família em `localStorage` é apenas UX e não contém sessão; seu uso é aceitável.

### Backend

- A introdução de `DomainError` não quebrou o formato HTTP: erros continuam `{error, detail}` e `mensagemErroHttp` permanece compatível.
- A extração de Repository/Service no backend preservou os payloads de notificações e instrumentos.
- O frontend ainda espelha contratos manualmente e não há geração/checagem OpenAPI. O build atual demonstra drift: `ResumoApi`, `InauguracaoApi` e `InstrumentoApi` das páginas já não correspondem aos tipos inferidos pelos schemas do service.
- A nova paginação/teto do backend não foi modelada como contrato comum. Onde há paginação real, cada service define seu próprio resultado; onde há apenas teto, a UI assume lista completa.
- O envelope constitucional do backend ainda não foi adotado. Quando mudar, os três clientes e todos os schemas-raiz serão afetados; essa mudança exige Plan Mode coordenado.

## Achados prioritários

### P0 — build e fonte da verdade

1. `npm run build` falha com TS1261 porque `Modal.tsx`/`Pagination.tsx` coexistem com imports em minúsculas. O erro persiste desde o diagnóstico anterior.
2. `monitoramento-overview-page.tsx` declara tipos manuais mais largos que os schemas: inaugurações exigem campos inexistentes no retorno inferido e `fase_atual` não aceita `undefined`.
3. Tipos das páginas devem ser derivados de `ResumoMonitoramento` e `InstrumentoEquipamento`, com projeções por `Pick` quando necessário. Não duplicar contratos de wire.
4. O `AGENTS.md` declara `src/features/<nome>/index.ts`, mas o código possui 44 arquivos em `src/components/features` e zero em `src/features`. Documentação e implementação não podem continuar afirmando estados distintos.

### P1 — cliente HTTP e sessão

1. Criar um único cliente responsável por base URL, cookies, CSRF, refresh compartilhado, retry único, redirect e `ApiError`.
2. Manter schemas por domínio, mas eliminar as três implementações de transporte.
3. Garantir que um 401 simultâneo em dashboard, convênios e monitoramento resulte em apenas um `/auth/refresh`.
4. Separar mensagem segura para usuário de detalhe técnico de contrato; o detalhe deve ficar disponível apenas para diagnóstico controlado.
5. Testar login, refresh deduplicado, CSRF, logout, 401 definitivo e payload inválido.

### P1 — arquitetura e tamanho

1. Há 21 arquivos acima das 200 linhas recomendadas.
2. `secao-propostas-candidatas.tsx` tem 868 linhas e combina parsing dinâmico, regra, filtros, mutations e várias seções visuais.
3. `monitoramento.ts` tem 578 linhas; `api.ts`, 494; `convenios.ts`, 233. A divisão deve ser por domínio sobre um transporte comum.
4. `monitoramento-painel-page.tsx` tem 460 linhas; overview, 323. Ambas ainda fazem `useEffect + useState + Promise.all`, apesar de TanStack Query já existir.
5. `useFiltrosMacro.ts` mantém 348 linhas de estado e transformação.
6. Propostas candidatas continuam processando estruturas de negócio como `Record<string, unknown>` dentro do componente.
7. Páginas devem apenas compor features; IO e transformação assíncrona devem ficar em hooks.

### P1 — qualidade, UX e acessibilidade

1. Existem sete arquivos e 30 testes, todos de funções puras. Não há `.test.tsx`, Testing Library, axe ou E2E.
2. Nenhum teste cobre `ApiError`, Zod inválido, refresh, CSRF ou `ProtectedRoute`.
3. O lint termina com 15 warnings: seis expressões sem efeito e nove violações de Fast Refresh.
4. Loading de overview/painel é texto simples; erros não oferecem retry e mostram detalhe técnico.
5. Não existe sistema consistente de toast/sucesso nem Error Boundary global.
6. Quatro cabeçalhos ordenáveis usam `span onClick`, sem botão, teclado ou `aria-sort`.
7. Não há evidência automatizada ou manual versionada de foco, Escape, Enter, labels e anúncios dinâmicos.

### P2 — responsividade e performance

1. O código possui wrappers de overflow e breakpoints pontuais, mas as rotas protegidas não foram verificadas visualmente em 400px e 768px nesta etapa.
2. Mapas, filtros e tooltips ainda usam dimensões fixas que precisam de inspeção em viewport estreita.
3. Listas do monitoramento podem chegar a 500 itens e municípios a milhares; algumas telas filtram/renderizam tudo no cliente sem virtualização.
4. O build não chega à etapa Vite, portanto não há relatório válido de chunks/bundle nesta revisão.
5. Rotas usam `lazy`, um ponto positivo preservado.

### P2 — código residual

- `card-group`, `table-editorial`, `meta-grid` e `kpi-row` existem em `index.css` sem consumidores encontrados. São candidatos a remoção ou adoção explícita.
- `Modal` é um wrapper legado sobre Dialog; deve ser removido quando os três consumidores migrarem, sem manter dois contratos equivalentes.
- Comentários longos de histórico ocupam services e páginas. Decisões duráveis pertencem à documentação; o código deve guardar apenas contexto local necessário.
- Hooks de GeoJSON executam `fetch` fora de services. É aceitável separar API operacional de assets geográficos, mas os hooks precisam de schema/adapter explícito e erro normalizado.

## Próximo bloco recomendado

### Bloco 0 — restaurar o estado entregável

- Renomear fisicamente `Modal.tsx` e `Pagination.tsx` para kebab-case e alinhar imports.
- Remover tipos duplicados de overview/painel e usar tipos derivados dos schemas.
- Corrigir os 15 warnings reais.
- Fazer `typecheck`, `test` e `build` passarem antes de refatoração arquitetural.

### Bloco 1 — transporte HTTP único

- Extrair cliente comum com refresh mutex global, CSRF, retry, redirect e erro seguro.
- Manter services/schemas por domínio sobre esse cliente.
- Escrever testes do transporte e sessão.

### Bloco 2 — feature piloto

- Resolver formalmente a divergência FSD.
- Migrar propostas candidatas para `src/features/propostas-candidatas` com API pública, hooks, schemas e componentes menores.
- Remover código e tipos substituídos no mesmo bloco.

### Blocos seguintes

1. Migrar monitoramento e depois cobertura/mapa, uma feature por vez.
2. Padronizar Skeleton, retry, empty state, toast e Error Boundary.
3. Adicionar Testing Library, axe e E2E do login + rota protegida.
4. Validar 400px/768px e virtualizar/paginar listas grandes.
5. Criar CI frontend com lint sem warnings, typecheck, testes e build.

## Critério de encerramento

- Lint sem warnings, typecheck, testes e build passam localmente e no CI.
- Um único transporte HTTP controla cookie, CSRF, refresh e erro.
- Todo payload operacional é validado com Zod e os tipos da UI derivam do schema.
- Páginas compõem features e não executam IO diretamente.
- Estrutura real e `AGENTS.md` descrevem a mesma arquitetura.
- Hooks, services e componentes interativos possuem testes de sucesso e falha.
- Login e fluxos críticos possuem E2E.
- Teclado, foco, WCAG AA, 400px e 768px são validados.
- Listas grandes possuem paginação, teto detectável ou virtualização.
- Código, CSS e tipos substituídos são removidos em cada bloco.

## Evidências executadas

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
