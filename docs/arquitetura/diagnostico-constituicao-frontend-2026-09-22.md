# Diagnóstico sênior — Constituição Frontend (fechamento, 2026-09-22)

## Escopo e método

Este fechamento reavalia a rodada de 2026-09-22 contra
`padroes/frontend/constiuicao_frontend.md`, após a execução do
`planmode-fechamento-frontend-2026-09-22.md`. Foram verificados arquitetura,
contratos de dados, estado remoto, formulários, acessibilidade,
responsividade, testes, arquivos mortos e contexto.

**Atualização de fechamento:** 22/09/2026, após os gates finais e a matriz
E2E autenticada serem executados com sucesso.

## Resultado executivo

**Conformidade atual: 9,4/10.** Os achados P1 da rodada foram encerrados:
filtros são controles acessíveis e reutilizam o mesmo workspace, GeoJSON passa
por service com Zod, páginas e detalhes densos foram separados por
responsabilidade, os formulários de conta usam RHF + Zod e há cobertura E2E
autenticada de sessão e viewport.

| Eixo | Nota | Evidência resumida |
|---|---:|---|
| Arquitetura e organização | 9,2 | Páginas são composição; Dados Oficiais, Dashboard, Mapa, Mesa e detalhe financeiro foram decompostos. Arquivos grandes remanescentes são serviços/exportadores coesos ou features especializadas, sem divisão mecânica. |
| Tipagem e contratos | 9,5 | Sem `any`/`as any`; serviços usam Zod e `ApiError`, inclusive GeoJSON. |
| Estado, UX e formulários | 9,4 | TanStack Query e invalidações preservados; ativação, redefinição e recuperação usam RHF, Zod, labels e estados de envio/erro. |
| Responsividade e acessibilidade | 9,4 | Filtros têm semântica, teclado, Escape e teste axe; matriz autenticada não encontrou overflow global. |
| Performance | 9,0 | Rotas e bibliotecas pesadas continuam lazy; paginação/virtualização não foi simulada sem contrato `total` do backend. |
| Segurança | 9,0 | Sessão em cookie HttpOnly, CSRF e nenhum token em storage; o E2E recebe segredo só do ambiente. |
| Testes e gates | 9,6 | lint, typecheck, 78 testes, build e 3 cenários E2E autenticados passaram. |
| Código morto e contexto | 9,3 | Variante dark e comentários de layout obsoletos removidos após busca de consumidores; documentação de execução atualizada. |

## Evidências executadas

```text
cd frontend && npm run lint       → passou
cd frontend && npm run typecheck  → passou
cd frontend && npm run test       → 21 arquivos, 78 testes passaram
cd frontend && npm run build      → passou
cd frontend && E2E_EMAIL=… E2E_SENHA=… npm run test:e2e → 3 cenários passaram
```

O E2E autenticado verificou redirecionamento sem sessão, login válido e as
rotas Dashboard, Mapa, Relatórios e Monitoramento (visão geral e instrumentos)
em 320, 375, 400, 768, 1024 e 1440px. Em todos os recortes,
`scrollWidth <= clientWidth`; rolagem horizontal permanece restrita aos
containers próprios de tabelas e diagramas. Os testes rodam em série porque o
limite de login é por IP e usam a mesma conta descartável.

O build mantém code splitting: `exceljs` e `jspdf` ficam em chunks sob demanda;
nenhuma rota comum carrega essas bibliotecas de exportação de forma eager.

## Achados encerrados

- **Filtros:** `SingleSelectFilter` e `MultiSelectFilter` têm botões reais,
  ARIA, foco, setas, Enter e Escape. `FilterWorkspace` centraliza faixa,
  contagem e limpeza no Dashboard, Dados Oficiais, Mesa, Mapa, Linhas de
  Financiamento e exportadores.
- **Geodados:** hooks só coordenam TanStack Query; o service valida a estrutura
  mínima de FeatureCollection com Zod, normaliza falhas e preserva o mapa quando
  apenas o contorno municipal está indisponível.
- **Responsabilidade:** filtros, opções, resumo, lista e abas de Dados
  Oficiais; conteúdo do Dashboard; lista da Mesa; bloco do mapa; e timeline
  financeira de proposta estão em unidades de domínio próprias. Arquivos acima
  de 200 linhas foram avaliados um a um; serviços de API, exportadores e tipos
  de domínio permanecem coesos e não foram fragmentados só para cumprir uma
  métrica.
- **Conta e resiliência:** formulários foram separados, validados e a árvore
  de rotas é protegida por `AppErrorBoundary` sem esconder erros locais de API.

## Limpeza e contexto

- Não há arquivo rastreado `.DS_Store`; ele continua ignorado. Nenhum arquivo
  foi apagado sem busca prévia de consumidores estáticos e dinâmicos.
- Artefatos temporários do Playwright foram removidos após os testes; segredos
  E2E não foram gravados em código, documentos ou resultados persistentes.
- `diagnostico-constituicao-frontend-2026-09-16.md` permanece como fotografia
  histórica. Este documento e o plan-mode de fechamento registram o estado
  atual e substituem suas pendências como referência operacional.

## Pendências de evolução (não bloqueiam este fechamento)

- Virtualização só deve ser introduzida quando a API expuser `total`/`meta` e
  houver uma lista medida que justifique a complexidade.
- A revisão contínua de arquivos grandes continua parte do code review; não há
  achado de responsabilidade misturada que exija outra migração agora.

## Critério de fechamento

- [x] Filtros acessíveis, com teclado, axe e workspace comum.
- [x] GeoJSON via service, Zod, `ApiError` e feedback de indisponibilidade.
- [x] Páginas/componentes tocados com responsabilidade única.
- [x] Formulários de conta em RHF + Zod e Error Boundary global.
- [x] Matriz E2E autenticada e responsiva executada.
- [x] Gates, limpeza segura e documentação atualizados.

**Conclusão:** o plan-mode de fechamento frontend está executado integralmente.

## Atualização de regressão — 2026-09-24 (logout)

O botão `Sair` passou a transicionar explicitamente para `/login` no mesmo
clique, sem aguardar o timeout da API nem depender de uma re-renderização
indireta de `ProtectedRoute`. Antes da chamada remota terminar,
`useAuthSession` remove as queries autenticadas e fixa `currentUser` como
visitante; isso impede que dados de instrumentos, notificações ou usuários de
uma conta sejam reutilizados por outra e evita que a página de login consulte
prematuramente o cookie ainda em processo de remoção.

Falha de rede continua preservando a saída local, mas agora produz toast
seguro explicando que a revogação não foi confirmada no servidor. A regressão
unitária cobre cache protegido, estado visitante e falha remota. O spec E2E
passou a cobrir login → Sair → `/login`; sua execução requer as credenciais e
a stack efêmera providas pelo workflow, indisponíveis nesta sessão local.

## Atualização de produção — 2026-09-25 (CSRF cross-origin)

Foi corrigido o erro do botão `Sair` no deploy Vercel → Render. O cookie CSRF
é emitido pelo host da API e não pode ser lido por `document.cookie` no host do
frontend; por isso o logout chegava sem `X-CSRF-Token` e recebia 403. O cliente
agora recupera a cópia do token por `GET /auth/csrf`, protegido pela mesma
origem CORS, e a mantém somente em memória. Login e refresh também atualizam
essa cópia. O double-submit segue obrigatório e a cópia é descartada ao sair;
não foi introduzido `localStorage`, bearer ou exceção de CSRF. Os 29 testes
focados, lint e build passaram.

## Atualização de execução — 2026-09-25 (CNES nos filtros)

As três buscas textuais de dados de equipamentos agora incluem o CNES já
presente em seus contratos validados: Instrumentos e repasses
(`ConvenioUnificado.cnes`), Linhas de financiamento (`PropostaCandidata.cnes`)
e Monitoramento interno (`InstrumentoEquipamento.cnes`). Não foi criado um
novo filtro nem alterada a API; a mudança reaproveita os controles acessíveis,
normalização de texto, paginação e estados vazios existentes. Os placeholders
agora comunicam CNES como critério de busca.

O card deixa o valor de Programa sem conteúdo quando a fonte não o informar,
em vez de apresentar a mensagem “não encontrado em nenhuma fonte”. Testes de
regressão cobrem as três buscas por CNES e o estado vazio de Programa. Nesta
execução, `npm run lint`, `npm run typecheck`, `npm run test` (32 arquivos,
113 testes) e `npm run build` passaram.

## Fechamento — Plan Mode fechamento final (2026-09-25)

Dois achados corrigem a leitura anterior deste diagnóstico:

- **Paginação real (Bloco 3)**: `estabelecimento-table.tsx` já usa
  `useEstabelecimentosPage` com `page`/`pageSize=50` reais e `<Pagination>`
  — paginação de ponta a ponta já existia antes deste plan-mode, não é
  mais um gap. As demais listas (instrumentos, macro-coverage) são teto de
  segurança deliberado, sem necessidade de paginação real (volume muito
  abaixo do teto).
- **E2E no CI (Bloco 4)**: `.github/workflows/e2e_ci.yml` já dispara em
  push/PR tocando `frontend/**` (não só `backend/**`) desde antes deste
  plan-mode — o achado "E2E não roda em CI" desta categoria era impreciso,
  checava só `frontend_ci.yml` sem ver o workflow separado.

Bloco 9 podou comentário narrativo datado (`secao-propostas-candidatas.tsx`,
`lib/proposta-metas-resumo.ts`, `monitoramento-equipamentos-page.tsx`),
preservando todo raciocínio técnico. `useJson.ts` (candidato de limpeza
desde 17/09) já não existe mais no repo.
