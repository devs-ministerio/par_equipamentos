# Plan Mode — frontend (2026-09-17)

Cobre o roadmap recomendado pela reavaliação de
`diagnostico-constituicao-frontend-2026-09-16.md` (nota de conformidade 6,4/10, nota de UI/UX
5,8/10 — auditoria visual sênior em 8 rotas × 3 breakpoints). Formato conforme
`padroes/frontend/constiuicao_frontend.md` Seção 2 (Plan Mode obrigatório), adaptado ao mesmo
esqueleto usado em `planmode-backend-2026-09-17.md` (Objetivo / Arquivos afetados / Estratégia /
Riscos por bloco).

Investigação prévia (sem alterar nada) reconfirmou, no código atual, cada achado P0/P1/P2 do
diagnóstico: `npm run build` falha com `TS1261` (casing `Modal.tsx`/`Pagination.tsx` vs. imports
minúsculos) e `TS2345` (tipos manuais de `monitoramento-overview-page.tsx` divergindo dos schemas
Zod); `npm run lint` termina com 15 warnings; `src/features/` não existe e `components/features/`
tem 44 arquivos; 21 arquivos passam de 200 linhas; `.card-group`/`.table-editorial`/`.meta-grid`/
`.kpi-row` estão em `index.css` sem nenhum consumidor real. Nada disso foi alterado nesta entrega —
só documentado e priorizado.

## Bloco 0 — restaurar o entregável (P0, executar primeiro)

**Objetivo**: fazer `lint`/`test`/`build` passarem de novo. Hoje nenhum dos três está verde, então
qualquer refatoração maior (Blocos 1+) parte de uma base que já não builda — prioridade absoluta
sobre qualquer mudança visual.

**Arquivos afetados**: `frontend/src/components/common/Modal.tsx` → `modal.tsx`,
`Pagination.tsx` → `pagination.tsx` (rename); `frontend/src/pages/monitoramento-overview-page.tsx`
(e o equivalente do Painel de Gestão, a confirmar ao abrir); os ~10 arquivos dos 15 warnings de
lint (`status-filter-buttons.tsx`, `nivel-cobertura-table.tsx`, `sub-nivel-rows.tsx`,
`cobertura-table.tsx`, `export-xlsx-modal.tsx`, `export-pdf-modal.tsx`, `monitoramento-ui.tsx`,
`button.tsx`, `badge.tsx`, `secao-propostas-candidatas.tsx`, `familia-equipamento-context.tsx`);
`frontend/src/index.css` + `frontend/src/components/ui/card.tsx`; `backend/app/schemas.py`.

**Estratégia**:

1. `git mv Modal.tsx modal.tsx` / `git mv Pagination.tsx pagination.tsx` (os 7 importadores já usam
   o caminho minúsculo — só o arquivo físico está com casing errado; em filesystem
   case-insensitive pode exigir um nome intermediário para o git registrar o rename).
2. Remover os tipos manuais `InauguracaoApi`/`ResumoApi`/`InstrumentoApi` de
   `monitoramento-overview-page.tsx` e derivar via `z.infer` dos schemas já validados em
   `services/monitoramento.ts` (`Pick`/tipo derivado onde a página usa só um subconjunto do
   contrato). Não duplicar contrato de wire — é a mesma regra que a Seção 8 da constituição já
   exige e que o próprio diagnóstico cita como causa da quebra do build.
3. Corrigir os 15 warnings: `no-unused-expressions` (6 ocorrências) é expressão solta sem efeito —
   remover ou converter em statement válido; `react/only-export-components` (9 ocorrências) exige
   mover a constante/helper não-componente para um arquivo próprio, deixando o módulo do componente
   exportar só o componente (Fast Refresh).
4. Remover de `index.css` as classes sem consumidor confirmado por grep:
   `.card-group`/`.card-group-accent`/`.table-editorial` (+ variantes)/`.meta-grid`/`.kpi-row`, e o
   comentário em `ui/card.tsx` que as referencia. Reconfirmar grep no estado atual antes de
   remover, mesma cautela do Bloco D do Plan Mode backend.
5. `backend/app/schemas.py`: `EmailStr` rejeita o domínio `.local` da credencial administrativa
   (achado transversal P0 #10 da auditoria visual — login trava com esse domínio tanto na entrada
   quanto em `UserRead`, e a UI mostra `[object Object]` no 422). Trocar por validação que aceite
   esse domínio reservado sem abrir mão de rejeitar e-mail malformado nos demais casos; no
   frontend, garantir que o detalhe do 422 sempre vira mensagem legível (não o unificar tratamento
   de erro inteiro — isso é Bloco 1).

**Dados**: nenhum contrato de API muda de formato — só os tipos do lado do cliente passam a
derivar do que o backend já devolve.

**Resiliência**: `cd frontend && npm run lint && npm run test && npm run build` verdes ao final —
é o critério de "restaurado" do próprio diagnóstico. `cd backend && uv run pytest` sem regressão
pelo ajuste de `EmailStr`; testar manualmente (ou via suite de auth, se existir) que o login com
credencial `.local` funciona e que a UI não mostra mais `[object Object]`.

**Riscos**: renomear arquivo em filesystem case-insensitive é a única armadilha operacional; o
resto é mecânico e de baixo risco (dead code sem consumidor, tipos derivados de schema já
validado).

## Bloco 1 — transporte HTTP único (P1)

**Objetivo**: eliminar os três mutexes de refresh independentes (`api.ts`, `convenios.ts`,
`monitoramento.ts`) — um 401 simultâneo em serviços diferentes pode hoje disparar mais de uma
rotação de refresh token e produzir logout/redirecionamento intermitente.

**Arquivos afetados**: novo cliente HTTP comum (local a definir, ex. `src/lib/http-client.ts`);
`src/services/api.ts`, `src/services/convenios.ts`, `src/services/monitoramento.ts` passam a usar
esse cliente em vez de reimplementar cookie/CSRF/refresh/redirect cada um.

**Estratégia**: extrair para o cliente comum o que hoje está triplicado: `credentials: 'include'`,
header `X-CSRF-Token` (via `csrfHeaders()`), mutex de refresh (uma única promise em voo por vez,
compartilhada entre os três domínios), decisão de redirect para `/login` em 401 definitivo, e
normalização de erro em `ApiError` com mensagem segura separada do detalhe técnico. Cada service
mantém seus schemas Zod por domínio — só o transporte sobe para o cliente comum.

**Dados**: nenhum contrato de API muda; é refatoração de transporte, não de payload.

**Resiliência**: testes novos do cliente comum cobrindo refresh deduplicado (duas chamadas 401
simultâneas geram um único `/auth/refresh`), CSRF, logout, 401 definitivo e payload Zod inválido —
achados P1 do diagnóstico que hoje não têm nenhuma cobertura de teste.

**Riscos**: toca os 3 pontos de entrada de toda chamada HTTP autenticada da aplicação — mudança
estrutural, exige Plan Mode próprio antes de executar (este documento só formaliza o escopo, não
autoriza a execução).

## Bloco 2 — resolver divergência de estrutura de pastas (P1)

**Objetivo**: eliminar a contradição entre `AGENTS.md` (descrevia `src/features/<nome>/index.ts`)
e o `CLAUDE.md`/código real (flat, `components/features/`, decisão tomada em 2026-09-11).

**Arquivos afetados**: `AGENTS.md` (raiz).

**Estratégia**: como o `CLAUDE.md` já reflete a decisão real e vigente, este bloco é só de
alinhamento documental — resolvido nesta mesma entrega (ver seção "Execução" abaixo), sem
mexer em código. Se `AGENTS.md` cumprir um propósito distinto do `CLAUDE.md` (formato aberto para
ferramentas fora do Claude Code, ver `padroes/CLAUDE.md`), ele continua existindo, mas sincronizado
em conteúdo.

**Dados**: não aplicável.

**Resiliência**: reler os dois arquivos após a edição e confirmar ausência de contradição.

**Riscos**: nenhum — mudança de documentação.

## Blocos seguintes (não detalhados nesta entrega)

Listados pela reavaliação, cada um exigindo seu próprio Plan Mode quando chegar a vez:

- **App shell responsivo**: header quebra em 768px e 400px em todas as rotas — é o P0 visual
  identificado pela auditoria.
- **Padrões de composição**: Page Header, Filter Workspace, Data Surface, Operational Detail —
  consolidar antes de migrar rota por rota (Dashboard como piloto de análise, Mesa de trabalho como
  piloto operacional).
- **Responsividade sistêmica**: overflow horizontal comprovado em 400px no Painel Geral (504px),
  Dashboard (517px) e Relatórios (434px); mapas e tabelas ilegíveis em viewport estreita.
- **Testes de componente e E2E**: hoje zero `.test.tsx`, zero Testing Library/axe/E2E — cobrir pelo
  menos login e uma rota protegida.
- **Virtualização/paginação real** de listas grandes (instrumentos, municípios) que hoje só têm
  teto de segurança silencioso no backend, sem `total`/`meta` para o frontend detectar truncamento.
- **CI frontend**: lint sem warnings + typecheck + test + build, hoje inexistente.

## Ordem de execução recomendada

1. **Bloco 0** — pré-requisito de tudo: sem build/lint verdes, qualquer refatoração maior parte de
   uma base instável.
2. **Bloco 2** — documental, resolvido nesta mesma entrega, sem dependência de código.
3. **Bloco 1** — depois do Bloco 0, porque toca os mesmos services cujos tipos o Bloco 0 já
   corrigiu; fazer as duas coisas juntas duplicaria revisão do mesmo arquivo.
4. **Blocos seguintes** — só depois de 0 e 1 estarem fechados e testados; a refatoração visual
   sistêmica é o maior risco de regressão do conjunto e não deve competir com a estabilização do
   transporte HTTP.

Implementação do Bloco 0/1 segue item a item, após aprovação explícita — nenhum código de
`frontend/`/`backend/` foi alterado nesta entrega do Plan Mode.

## Execução

Bloco 2 resolvido em 2026-09-17: `AGENTS.md` (raiz) reescrito para espelhar a estrutura real
documentada em `CLAUDE.md` (flat, `components/features/`, kebab-case). Blocos 0 e 1 permanecem
pendentes de aprovação e execução numa próxima rodada.
