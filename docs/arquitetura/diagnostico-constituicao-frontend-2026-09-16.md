# Diagnóstico da Constituição Frontend — 2026-09-16

> **Nota de escopo (2026-09-17)**: este documento não foi reescrito por inteiro após a data da
> avaliação — vários achados abaixo (build quebrado por casing, `src/features/` vs. estrutura
> flat) já foram superados por trabalho posterior, ver `CLAUDE.md` seção "Estrutura de pastas do
> frontend" e "Camada de dados". Só os 2 itens explicitamente tocados pela validação de
> `planmode-consolidacao-2026-09-17.md` foram marcados como resolvidos aqui (P1 "JWT em
> `localStorage`" e "Bloco 6 — sessão", ambos abaixo) — o resto do documento segue como
> fotografia da data original, não uma reavaliação completa do estado atual do frontend.

## Escopo e método

Este diagnóstico confronta `padroes/frontend/constiuicao_frontend.md`,
`padroes/qualidade/constituicao_qualidade.md` e as convenções locais de
`AGENTS.md` com o frontend atual. Foram analisados arquitetura, serviços,
estado remoto, contratos Zod, formulários, design system, responsividade,
acessibilidade, segurança, performance, testes e gates de entrega.

Esta etapa não altera comportamento nem corrige os achados. O objetivo é
estabelecer uma linha de base confiável para aplicação incremental.

## Resumo executivo

O frontend possui uma base visual e técnica melhor que a organização atual
sugere: React 19, TypeScript estrito, Tailwind v4, shadcn/Radix, identidade
visual própria, carregamento por rota, TanStack Query, React Hook Form e Zod já
estão presentes. Os serviços principais validam respostas com Zod e
normalizam falhas em `ApiError`.

O bloqueador imediato é objetivo: **o build não passa**. `Modal.tsx` e
`Pagination.tsx` têm nomes em PascalCase, mas são importados em minúsculas. O
TypeScript detecta a divergência de casing, que também é incompatível com a
regra de arquivos em kebab-case.

A migração arquitetural também divergiu do contexto local. `AGENTS.md`
registra features em `src/features/<nome>` com `index.ts` público, mas essa
pasta não existe no estado atual; 44 arquivos de domínios diferentes estão
achatados em `src/components/features`. É necessário decidir e atualizar uma
única fonte da verdade antes de continuar movendo arquivos.

Avaliação inicial: **6,2/10 de conformidade frontend**. A base de design,
tipagem e dados remotos é boa, mas build quebrado, ausência de testes de UI,
fetch em páginas, componentes excessivos, acessibilidade incompleta e ausência
de CI frontend impedem uma nota maior.

## Evidências objetivas

- Aproximadamente 15 mil linhas TypeScript/TSX.
- 44 arquivos no diretório plano `components/features`.
- 20 arquivos acima das 200 linhas recomendadas.
- Maior componente: `secao-propostas-candidatas.tsx`, 868 linhas.
- Maiores páginas: `monitoramento-painel-page.tsx`, 458 linhas;
  `monitoramento-equipamentos-page.tsx`, 385;
  `dashboard-page.tsx`, 330; `monitoramento-overview-page.tsx`, 324.
- Serviços monolíticos: `monitoramento.ts`, 505 linhas; `api.ts`, 454.
- Cinco arquivos fora de `services/` executam `fetch` diretamente.
- 37 usos de `style`; parte é justificável para D3, dimensões calculadas e
  barras, mas parte ainda representa migração visual incompleta.
- Sete arquivos de teste, 30 testes, todos de lógica pura.
- Zero testes de componente `.test.tsx`.
- `npm run test -- --run`: 30 testes passando.
- `npm run lint`: conclui com 14 warnings.
- `npm run build`: falha por inconsistência de casing.
- Não existe workflow de CI para lint, typecheck, teste ou build do frontend.

## Pontos conformes ou bem encaminhados

### Design system e identidade

- Tailwind v4 e shadcn/Radix estão configurados corretamente para Vite.
- A paleta substitui os defaults do shadcn por fundo aquecido, verde-petróleo
  e cores semânticas próprias.
- Radius de controles e cards é diferenciado; sombras são majoritariamente
  reservadas a overlay ou agrupamento.
- Há par tipográfico e fonte própria para dados numéricos.
- Componentes base de botão, input, dialog, tabela, badge, popover e card são
  reutilizados.
- As rotas usam `lazy` e `Suspense`, evitando carregar mapas e páginas pesadas
  no bundle inicial.

### Dados e formulários

- Os três services principais validam respostas com schemas Zod.
- `ApiError` normaliza falhas de rede, HTTP e contrato.
- TanStack Query possui `staleTime`, retry e invalidação após mutações.
- Formulários recentes usam React Hook Form, Zod e schemas separados em
  `lib/validations/monitoramento.ts`.
- A aplicação já representa loading, erro e vazio em diversos fluxos.
- Cálculos centrais de cobertura, texto, geografia e status possuem testes de
  unidade com casos de borda relevantes.

## Divergências prioritárias

### P0 — build e fonte da verdade arquitetural

1. **Build quebrado por casing.** `components/common/Modal.tsx` e
   `Pagination.tsx` são importados como `modal` e `pagination`. Em filesystem
   case-sensitive isso também quebra resolução. Devem convergir para
   kebab-case, sem manter aliases duplicados.

2. **FSD local divergente.** `AGENTS.md` define
   `src/features/<feature>/{components,hooks,lib,types}/index.ts`, mas o código
   atual usa `src/components/features` sem fronteiras públicas. Escolher um
   padrão antes do próximo bloco e sincronizar documentação e imports.

3. **Gates não estão no CI.** Os workflows existentes executam pipelines de
   dados, sem `npm run lint`, `typecheck`, `test` ou `build`. O erro atual
   chegaria à entrega sem bloqueio automatizado.

### P1 — responsabilidades e tamanho

1. **Páginas ainda concentram regra e IO.** `monitoramento-overview-page.tsx`
   e `monitoramento-painel-page.tsx` fazem fetch, modelam tipos, transformam
   dados, controlam estado e renderizam dashboards.

2. **Fetch fora de services.** Além das duas páginas anteriores,
   `useContornoMunicipio`, `useMacroGeojson` e o genérico `useJson` chamam
   `fetch`. GeoJSON pode continuar em adapter dedicado, mas não deve escapar
   sem validação de fronteira.

3. **Componentes acima do limite.** `secao-propostas-candidatas.tsx` combina
   parsing de payload, regras de classificação, filtros, mutation e múltiplas
   seções visuais em 868 linhas. É o maior risco de manutenção.

4. **Services monolíticos.** `monitoramento.ts` reúne autenticação,
   instrumentos, eventos, ações, resumo, notificações e propostas. `api.ts`
   reúne todos os contratos de cobertura e oferta. Separar por domínio sem
   duplicar o cliente HTTP.

5. **Hook excessivo.** `useFiltrosMacro.ts` possui 348 linhas e mistura estado,
   regras de cascata, normalização de opções e agregações. A regra pura deve
   ser extraída e testada separadamente.

6. **Tipos duplicados nas páginas.** Overview e painel declaram manualmente
   tipos que já deveriam derivar dos schemas do service. Isso permite drift
   silencioso do contrato.

### P1 — segurança de sessão e contratos

1. ~~**JWT em `localStorage`.**~~ **RESOLVIDO** — a migração para cookie `HttpOnly`
   (`planmode-seguranca-2026-09-16.md`, Bloco 2) já aconteceu antes deste diagnóstico ser
   atualizado (achado da validação prévia de `planmode-consolidacao-2026-09-17.md`). Reconferido:
   `grep -rln "Authorization|Bearer|access_token|localStorage" frontend/src/` só retorna
   comentário/docstring explicando a migração já feita, ou uso de `localStorage` sem relação com
   auth (preferência de família de equipamento). O bearer fallback do backend (que ainda existia
   como compatibilidade dupla) foi removido em 2026-09-17 (Bloco 2 de
   `planmode-consolidacao-2026-09-17.md`) — sem mais nenhum consumidor via header.

2. **Chamadas manuais sem Zod.** As páginas de overview/painel usam
   `response.json()` e casts genéricos; payload malformado chega à UI como dado
   confiável.

3. **Cliente HTTP duplicado.** `api.ts`, `convenios.ts` e `monitoramento.ts`
   repetem montagem de URL, tratamento de fetch, leitura de erro e parsing.
   Isso já produz mensagens e autenticação diferentes entre domínios. **Achado
   parcialmente tocado em 2026-09-17** (Bloco 1 de `planmode-consolidacao-2026-09-17.md`): os 3
   anexam o header CSRF (`frontend/src/lib/csrf.ts`) de forma consistente — não fecha a duplicação
   em si, que segue como este mesmo achado P1.3.

4. **Erro técnico exposto.** Algumas telas exibem `error.message`, que pode
   conter status, caminho e erro detalhado do schema Zod. A UI deve mostrar
   mensagem adequada e preservar detalhe apenas para telemetria/desenvolvimento.

5. **Integração com backend futuro.** Quando a autenticação por padrão for
   aplicada no backend, os GETs de cobertura, convênios e overview precisarão
   enviar sessão de forma uniforme. A migração deve ser coordenada.

### P1 — acessibilidade

1. Cabeçalhos ordenáveis usam `<span onClick>` sem semântica de botão,
   teclado ou `aria-sort` em quatro pontos das tabelas de cobertura.

2. `InfoIcon` usa `span role="button"`; funciona com foco, mas um botão real e
   tooltip Radix oferece semântica, Escape e gerenciamento de foco melhores.

3. Não há suíte automatizada com Testing Library, `jest-dom` ou axe; portanto
   modais, foco, navegação por teclado, labels e mensagens de erro não têm gate.

4. Estados de loading e erro frequentemente são texto simples sem
   `role="status"`, `aria-live` ou estratégia consistente de foco.

5. Tabelas e filtros precisam de revisão sistemática de caption, associação
   label/controle e anúncio de resultados após filtro/paginação.

### P1 — UX obrigatória

1. Loading usa majoritariamente texto; a constituição prefere Skeleton.

2. Erros raramente oferecem botão “Tentar novamente”, apesar de TanStack Query
   disponibilizar `refetch`.

3. Estados vazios existem, mas muitas vezes não possuem CTA contextual.

4. Mutações mostram erro e estado disabled/loading em alguns fluxos, porém não
   existe sistema consistente de toast/sucesso.

5. Não há Error Boundary para falha de renderização fora do fluxo de queries.

### P1 — testes e qualidade

1. Os 30 testes cobrem funções puras; nenhum hook, service ou componente React
   é exercitado conforme a pirâmide exigida.

2. Não há teste provando que services convertem falha HTTP em `ApiError` ou
   rejeitam payload incompatível com Zod.

3. Não há `jsdom`, Testing Library, Playwright ou fluxo E2E crítico.

4. Não existe configuração de cobertura nem threshold por camada.

5. O lint possui 14 warnings, incluindo expressões sem efeito e arquivos que
   misturam componentes com exports auxiliares, afetando Fast Refresh.

6. O TypeScript só é efetivamente validado pelo build, que está quebrado.

### P2 — responsividade e performance

1. Há uso de `auto-fit`, wrappers com overflow e alguns breakpoints, mas apenas
   sete ocorrências de variantes responsivas Tailwind em páginas/componentes.
   Isso não prova adaptação completa nos cinco breakpoints exigidos.

2. Larguras fixas em pixels aparecem em filtros, mapas, tooltips e layouts.
   Algumas são legítimas, mas `min-width` e mapas de 560px exigem inspeção real
   em 400px e 768px.

3. Não existe evidência versionada de teste visual nos breakpoints mínimos.

4. Listas com 100+ instrumentos/propostas são filtradas e renderizadas no
   cliente sem virtualização em alguns fluxos, contrariando a regra de
   virtualização acima de 100 itens.

5. Não há medição de bundle ou orçamento de performance. Exportação PDF/XLSX
   e mapas são dependências pesadas; o code splitting reduz o risco, mas deve
   ser confirmado pelo relatório do build quando ele voltar a passar.

### P2 — consistência visual e código residual

1. O projeto está no meio da migração: 37 inline styles permanecem. Estilos
   calculados de mapa/barra são aceitáveis; dimensões e cores estáticas devem
   migrar para tokens/classes quando o componente for tocado.

2. Há componentes próprios antigos (`Modal`, `InfoIcon`) coexistindo com
   primitives Radix/shadcn. `Modal` já delega para Dialog; pode desaparecer
   quando os consumidores aceitarem diretamente o contrato do Dialog.

3. `card-group`, `table-editorial`, `meta-grid` e `kpi-row` foram definidos no
   tema, mas têm pouco ou nenhum uso. Na próxima rodada deve-se decidir entre
   adoção real e remoção, evitando CSS aspiracional morto.

4. Comentários históricos extensos ajudam a preservar decisões, mas vários
   arquivos carregam narrativa de sessão no corpo do componente. Decisões
   duráveis devem migrar para docs; o código deve manter apenas o motivo que
   evita regressão local.

## Sequência recomendada de aplicação

### Bloco 1 — restaurar gates

- Corrigir casing/nomenclatura dos componentes comuns.
- Zerar warnings reais do lint.
- Fazer `typecheck`, testes e build passarem.
- Criar workflow frontend com esses quatro gates.

### Bloco 2 — cliente HTTP e contratos

- Criar um único cliente fetch com autenticação, normalização de erro e parsing
  Zod.
- Dividir schemas/services por domínio.
- Migrar overview e painel para services + hooks TanStack Query.
- Remover `useJson<T>` genérico ou restringi-lo a schema obrigatório.

### Bloco 3 — arquitetura de features

- Resolver a divergência entre `AGENTS.md` e `components/features`.
- Migrar uma feature por vez, com API pública e sem imports profundos.
- Começar por propostas candidatas, que concentra o maior componente.
- Depois separar monitoramento e cobertura/mapa.

### Bloco 4 — UX e acessibilidade

- Padronizar Skeleton, Alert com retry, empty state e toast.
- Trocar controles clicáveis não semânticos por Button/Tooltip/Tabs adequados.
- Adicionar Testing Library e axe para fluxos interativos.
- Validar foco, Escape, Enter, labels e anúncios de atualização.

### Bloco 5 — responsividade e performance

- Inspecionar todas as rotas em 400px, 768px, 1024px e 1440px.
- Corrigir overflow global e larguras mínimas.
- Paginar ou virtualizar listas acima de 100 itens.
- Medir chunks e definir orçamento de bundle.

### ~~Bloco 6 — sessão~~ — **RESOLVIDO**

- ~~Coordenar com backend a migração do JWT para cookie seguro~~ — feito em
  `planmode-seguranca-2026-09-16.md` (Bloco 2), confirmado nesta rodada (ver P1 acima).
- Garantir que autorização continue validada no backend; ocultação por role no
  frontend permanece apenas UX. (segue válido, sem mudança)

## Critérios para considerar o frontend fechado

- Lint sem warnings, typecheck, testes e build passam localmente e no CI.
- Nenhum componente/página executa fetch diretamente.
- Todo payload externo é validado por schema; tipos de UI derivam do contrato.
- Páginas compõem features e não concentram regra de negócio.
- Componentes com lógica relevante ficam abaixo do limite ou têm divisão
  justificada.
- Hooks, services e componentes interativos possuem testes de sucesso, erro e
  estados de borda.
- Rotas críticas possuem pelo menos um E2E.
- WCAG AA, teclado e foco são validados automaticamente e manualmente.
- Todas as rotas funcionam nos breakpoints obrigatórios sem scroll horizontal
  da página.
- Listas grandes têm paginação ou virtualização.
- Sessão não depende de armazenamento inseguro sem decisão de risco explícita.
- Código, CSS, tipos e componentes substituídos são removidos ao fim de cada
  bloco.

## Resultado dos gates nesta etapa

```text
npm run lint: concluiu com 14 warnings
npm run test -- --run: 7 arquivos, 30 testes passando
npm run build: falhou (TS1261, casing de Modal/Pagination)
CI frontend: inexistente
testes de componente: 0
```
