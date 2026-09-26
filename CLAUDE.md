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
  Não reaproveitar uma tabela pra fazer o papel da outra. Desde
  2026-09-19 (Plan Mode monitoramento-evolucao, ver seção própria abaixo)
  as duas ganharam "editar"/"excluir" na UI, mas continuam append-only:
  nunca UPDATE/DELETE físico numa linha existente.
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
- **Escopo bem menor que os 581 "Instrumentos firmados", e nem tudo que é
  firmado é monitorado internamente**: `convenio` ("Instrumentos
  firmados", `backend/app/routers/convenios.py`) é o universo completo de
  repasse — 581 registros desde a correção de 2026-09-18 (403 Convênio/
  SICONV/TransfereGov originais + 178 de FAF/TED/PERSUS I/PERSUS II/PRONON,
  ver `docs/arquitetura/diagnostico-ingestao-dados-2026-09-18.md`).
  `instrumento_equipamento` (monitoramento interno pós-repasse) é um
  subconjunto BEM menor — só o que a equipe decide acompanhar
  manualmente: **91** hoje (71 Convênio + 12 FAF + 3 TED + 5 PERSUS I
  ainda não inaugurado). PERSUS I inaugurado (87), PERSUS II (50) e
  PRONON (21) existem só em `convenio`, nunca em
  `instrumento_equipamento` — não é lacuna, é o desenho: só entra no
  monitoramento interno o que ainda precisa de acompanhamento ativo.
  Convênio/FAF/TED em `instrumento_equipamento` vêm de
  `backend/scripts/importar_planilha_monitoramento.py` (planilha real da
  equipe); PERSUS/PRONON em `convenio` (e PERSUS I não inaugurado também
  em `instrumento_equipamento`) vêm de
  `backend/scripts/importar_programas_monitoramento.py` — imports são
  cargas controladas, não sincronizações recorrentes. Convênio sem
  `InstrumentoEquipamento` não é erro — é o caso normal. Desde
  2026-09-09 o campo `tipo_contratacao` distingue "Convênio" (universo
  Portal/TransfereGov, `nr_convenio` real) de "FAF"/"TED"/"PERSUS I"/
  "PERSUS II"/"PRONON". **Identificador visível por origem, revisado
  2x em 2026-09-18** (1ª rodada: tudo aleatório; 2ª rodada, depois de ver
  o resultado renderizado: distinguir quem TEM identidade oficial de quem
  não tem):
  - **FAF/TED têm identidade oficial** — o NUP SEI (só dígitos, decisão
    2026-09-10 de tirar caracteres especiais, ex. NUP `25000.198305/2024-59`
    vira `25000198305202459`). `nr_convenio`/`Convenio.numero` é esse
    valor direto, sem indireção — mesmo esquema desde 2026-09-09/10, só
    que agora com espelho em `convenio` também.
  - **PERSUS I/PERSUS II/PRONON não têm NENHUM identificador oficial**
    (confirmado com o usuário pro PERSUS I; PRONON ainda sem fonte
    estudada, pendência registrada no diagnóstico de ingestão — não
    fabricar algo "melhor" sem essa decisão). `nr_convenio`/
    `Convenio.numero` é aleatório com prefixo curto do tipo (`PS1-503028`,
    `PS2-...`, `PN-...`, ver `backend/scripts/lib_identificadores.py`) —
    prefixo encurtado na 2ª rodada porque o nome completo (`PERSUS1-`)
    repetia o badge de tipo já exibido ao lado. O identificador
    determinístico original (`PERSUS1-{cnes}-{tipologia}` etc.) fica em
    `chave_origem` (`Convenio`/`InstrumentoEquipamento`), usado só pelos
    scripts de carga pra reencontrar o registro em execuções futuras,
    nunca exposto na API/UI.
  Nunca usar `/` cru em identificador de rota (`/instrumentos/{nr_convenio}`
  quebra mesmo como `%2F`, testado ao vivo) — por isso o NUP SEI de FAF/TED
  usa só dígitos, nunca a pontuação/barra original.
- **`tecnico_titular/suplente` (nossa equipe) ≠ `responsavel_execucao_nome/
  contato` (da instituição/convenente)**: campos parecidos, fontes
  diferentes — não confundir ao exibir ou editar.
- **Convênio pode financiar mais de 1 equipamento físico** (achado ao vivo
  2026-09-19, convênio 947527 — 2 aceleradores lineares, um entregue e
  outro só previsto pra 2027): o schema (`InstrumentoEquipamento`/
  `EventoMarco`) rastreia por CONVÊNIO, não por unidade física — não tem
  campo estruturado pra dizer "esse evento é do equipamento X". Heurística
  adotada (decisão do usuário, sem mudar schema): `equipamento_descricao`
  concatena os itens com `" + "` quando há mais de 1; quando esse padrão
  bate (`monitoramento-interno.tsx::multiploEquipamento`), o Cronograma
  físico/Regulatório (`monitoramento-interno-fase-cronograma.tsx`) mostra
  TODOS os eventos ativos do marco em vez de só o mais recente — pro caso
  normal (1 equipamento) continua mostrando só 1, tratando múltiplos
  eventos ativos como histórico de correção, não como equipamentos
  distintos. Os cards de resumo no topo (Inauguração/Licença CNEN)
  continuam mostrando 1 valor simplificado mesmo com múltiplos
  equipamentos — não foram redesenhados nesta rodada.
  - **Bug relacionado, corrigido na mesma investigação**: `listar_eventos_do_instrumento`
    (`app/repositories/monitoramento.py`) só ordenava por `created_at`, sem
    desempate por `id` — carga em lote grava vários eventos do mesmo marco
    com o MESMO `created_at` (timestamp do processo), e sem desempate a
    timeline podia escolher "o mais recente" errado. `obter_resumo`
    (`app/routers/monitoramento.py`) tinha o mesmo problema nos 2
    `max(..., key=created_at)` de licença/inauguração, e **nunca filtrava
    evento ativo** (`substituido_por_id`/`deletado_em`) — gap real do
    Bloco 1 do Plan Mode monitoramento-evolucao, que só cobriu
    `listar_instrumentos`/`obter_timeline`. Os três corrigidos.
  - **Limpeza de dados legados executada em 2026-09-19** (decisão do
    usuário): 33 grupos (instrumento, marco) tinham eventos duplicados do
    bug documentado em `diagnostico-ingestao-dados-2026-09-18.md`
    ("previsão de inauguração gravada como `data_ocorrencia` por engano,
    corrigida depois pra `data_prevista`") — o evento antigo (ocorrência
    errada) nunca tinha sido marcado como substituído pelo novo (previsão
    correta, mesma data). Vinculados via `substituido_por_id` (nenhuma
    linha apagada, `AuditLog` com `action=corrected_by_request` por
    vínculo). **16 grupos ficaram de fora de propósito** — não batem no
    padrão simples "mesma data, ocorrência→previsão" (ex. matrícula CNEN/
    SCRA duplicados sem data, possivelmente legítimos por serem de
    equipamentos diferentes) — não fabricar o vínculo sem revisão da
    equipe.

## Plan Mode monitoramento-evolucao (2026-09-19)

`docs/arquitetura/planmode-monitoramento-evolucao-2026-09-19.md` fechou o vínculo entre fase
geral e cronograma físico/regulatório, tornou evento/ação editáveis/excluíveis de forma
auditável, e ajustou nomenclatura/UI do módulo (3 blocos, todos concluídos).

- **Ciclo de vida append-only real (Bloco 0/1)**: `EventoMarco`/`AcaoMonitoramento` ganharam
  `atualizado_em`, `substituido_por_id` (self-FK) e `deletado_em`/`deletado_por_id`/
  `motivo_exclusao`. "Editar" nunca faz UPDATE no lançamento original — cria um registro novo
  corrigido e aponta o antigo pra ele via `substituido_por_id` (decisão do usuário, mantendo a
  mesma disciplina do `ConfigDecision`); "excluir" é soft delete com motivo obrigatório, nunca
  `DELETE` físico. "Ativo"/vigente = `substituido_por_id IS NULL AND deletado_em IS NULL` — só
  isso entra no cálculo de fase e nas listagens padrão (`app/repositories/monitoramento.py`);
  exclusão/correção nunca some de verdade, só sai da timeline visível.
- **`EventoMarco.fase_geral_id`** (novo, obrigatório no service — `_validar_fase_geral_id` em
  `app/services/monitoramento_eventos.py` — pra marco de grupo físico/regulatório; nulo quando o
  próprio evento já é de grupo=fase_geral) fecha um bug real confirmado ao vivo: evento de
  cronograma físico sendo lançado sem nunca mover a fase geral do instrumento. No frontend
  (`monitoramento-interno-form-evento.tsx`) o seletor de fase aparece só depois que um marco
  físico/regulatório é escolhido (não "fase primeiro, marco depois" como cogitado inicialmente —
  desvio de UX registrado no plan-mode, aceito por ser mais simples sobre a estrutura existente e
  ainda impedir o lançamento sem vínculo).
- **`finalidade` foi REMOVIDA e unificada em `tipologia`** (decisão do usuário: "é a mesma
  tipologia, use para todos") — `tipologia` (dicionário fechado `A`/`CV`/`C`/`EO`/`C.B`/`NA`, CHECK
  em `InstrumentoEquipamento`) deixou de ser exclusiva de PERSUS e passou a valer pra todo
  `tipo_contratacao`; o gate `tipoContratacao?.startsWith('PERSUS')` foi removido de
  `convenio-card-header.tsx`. Mapeamento fechado aplicado no backfill da migration
  (`e39d87b25964`): `Substituição→EO`, `Ampliação`/`Ampliação (cobalto)→A` — 61+18+2 registros
  reais migrados, sem tentativa de reconstruir a distinção "cobalto" perdida no processo.
- **`modalidade_onco` restrita por CHECK** a `Apoio`/`Diagnóstico`/`Rastreamento`/`Tratamento`/
  `Múltiplas` (frontend `MODALIDADES_ONCO` em `lib/monitoramento-opcoes.ts` reduzido dos 10
  valores antigos, nenhum dos removidos tinha uso real no banco).
- **`AcaoMonitoramento.responsavel_id`/`criado_por_id`** (FK de `User`, novos) — `responsavel_id`
  substitui o texto livre `responsavel` (mantido só como campo legado de leitura); `criado_por_id`
  é o marcador de quem criou a ação, preenchido sempre pelo backend a partir do usuário
  autenticado, nunca aceito do cliente. `EventoMarco.autor_id` já existia — só passou a ser
  exibido na UI (`autor_nome` resolvido via `resolver_nomes_usuarios`, sem N+1).
- **"Editar CNES" deixou de ser um picker solto no cabeçalho** — agora abre o mesmo dialog de
  "Editar cadastro" (`monitoramento-interno-form-cadastro.tsx`), com todos os campos exceto CNES
  desabilitados via `<fieldset disabled>` (prop `somenteCnes`, estado de abertura levantado pro
  orquestrador `monitoramento-interno.tsx` pra o botão do cabeçalho conseguir forçar esse modo).
- **Componente/Programa mesclados num único rótulo** no cabeçalho do detalhe do instrumento
  (`monitoramento-interno-cabecalho.tsx`) — prioridade: `componente` (planilha) →
  `componenteViaSiconv` (fallback já existente) → `programa` → `tp_instrumento_programa`. As
  colunas continuam separadas no banco (proveniência diferente); só a apresentação unificou. Não
  confundir com o formato `programa`/`componente` da feature de casamento de propostas
  TransfereGov (`types/monitoramento.ts`), que é outro contexto e não foi tocado.
- **Subtítulo "Convênio {nr}" removido** — breadcrumb/título/cabeçalho mostram só o número em
  todo lugar (`monitoramento-instrumento-page.tsx`, `monitoramento-interno-cabecalho.tsx`).
- **Fallback de "Valor global" pro dado do banco**: quando `ao_vivo.disponivel` é `false`
  (Portal da Transparência só cobre Convênio/SICONV — FAF/TED/PERSUS/PRONON nunca têm essa fonte),
  o cabeçalho do instrumento mostra `investimento_aquisicao` persistido no banco em vez de só
  "indisponível", quando esse valor existir.
- **Mesa de Trabalho**: colunas "Fase" e "Prestação de contas" trocaram de ordem; card
  "Prestação concluída" virou "Concluídos", recalculado por `fase_atual === 'Concluído'` (antes
  contava `situacao_prestacao_contas`, que só existe pra `tipo_contratacao="Convênio"`).
- **Reversão do 877881**: era um `InstrumentoEquipamento` criado no mesmo dia só pra testar a
  execução deste Plan Mode (nunca teve monitoramento real antes) — removido por completo
  (cascata: evento + ações de teste), não só zerado, com `AuditLog` (`reverted_by_request`)
  gravado antes do delete e snapshot local salvo fora do repo.
- **Achado ao vivo, corrigido**: `allow_methods` do CORS (`backend/app/main.py`) não incluía
  `DELETE` — os endpoints `DELETE /monitoramento/eventos/{id}` e `DELETE /monitoramento/acoes/{id}`
  são novos deste Plan Mode e nunca tinham sido exercitados contra um browser real antes; preflight
  `OPTIONS` falhava com 400. Lista passou a ser `GET/POST/PATCH/DELETE`.
- Reordenação do cronograma físico (`MarcoCatalogo.ordem` pra grupo físico/regulatório, hoje só
  populado pra fase_geral) ficou **fora desta rodada** por decisão do usuário — mesma pendência já
  registrada como "em revisão com a equipe técnica" antes deste Plan Mode.

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
- **Login e aceite de convite não são auditados** (achado 2026-09-26, ver
  detalhe em "Gestão de usuários" acima): nenhum sucesso/falha de login,
  logout ou ativação de conta gera `AuditLog` ou qualquer histórico
  consultável — só existe estado transitório (`failed_login_attempts`/
  `locked_until`) que se autozera. Correção proposta (não implementada,
  decisão de produto): `log_action` em `/auth/login`/`/auth/ativar` +
  expor `User.activated_at` em `UserRead`/tela de usuários.
- **Dados de teste (`pytest-*@example.com`) encontrados em produção**
  (achado 2026-09-25, ao investigar o incidente de dados sintéticos acima):
  `/admin/usuarios` em produção tem vários usuários `pytest-convite-*`/
  `pytest-criado-*@example.com` e a própria conta pessoal do usuário
  aparece com nome `teste_E2E` — sinal de que `scripts/
  provisionar_usuario_e2e.py`/testes de integração já rodaram contra o
  Neon de produção em algum momento, mesma classe de problema do incidente
  de `fixtures_cobertura.py`. **Não investigado nem limpo ainda** — fica
  registrado pra não esquecer, próxima sessão que mexer em usuários/E2E
  deveria investigar o alcance antes de assumir que só afetou cobertura.

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
  ver "Migration desacoplada do boot" logo abaixo. **Precedência desde o
  Plan Mode database 2026-09-17 (Bloco 2)**: um `DATABASE_URL` exportado de
  verdade no processo (`os.environ`, não o valor só mesclado do `.env`
  pelo pydantic-settings) vence sobre `database_url_migration` — corrige
  incidente real onde `alembic upgrade head` pensado para Postgres local
  atingiu o Neon porque o `.env` local tinha `DATABASE_URL_MIGRATION`
  setado. `backend/alembic/env.py` sempre ecoa (stderr, informativo, não
  gate) o host resolvido antes de rodar qualquer comando.
- **Migration desacoplada do boot e dos jobs (mesmo Plan Mode, Bloco 4)**:
  `render.yaml` sobe a API direto com `uvicorn`, sem `alembic upgrade head`
  no `startCommand` — `sigeo_runtime` nem teria privilégio pra isso.
  `pipelines.yml`/`radar_convenios.yml` também não rodam mais migration
  (sempre foi só DML). Aplicar migration é um passo manual/isolado:
  `.github/workflows/migrar_banco.yml` (`workflow_dispatch`,
  `DATABASE_URL_MIGRATION`) ou `uv run alembic upgrade head` local — sempre
  **antes** de qualquer deploy/job que dependa de schema novo, nunca depois.

## Arquitetura backend: erro de domínio + Repository/Service (Plan Mode backend 2026-09-17)

`docs/arquitetura/diagnostico-constituicao-backend-2026-09-16.md` (nota 7,0/10) apontou que a
maior parte do backend ainda é `Router -> SQLAlchemy` direto, sem hierarquia de erro de domínio.
`docs/arquitetura/planmode-backend-2026-09-17.md` (Bloco 1) começou a fechar isso, **sem migrar o
backend inteiro de uma vez** — só a fundação + uma feature-piloto:

- **`backend/app/domain_errors.py`** (novo) — `DomainError` base +
  `NotFoundError`/`ConflictError`/`ValidationError`/`AuthorizationError` (404/409/422/403). Service
  levanta essas, nunca `fastapi.HTTPException` — Service não deveria importar FastAPI. Tradução pra
  HTTP acontece só em `backend/app/errors.py` (`register_exception_handlers`), no mesmo formato
  `{"error": ..., "detail": None}` que já existia — nenhum contrato HTTP mudou. **Migrado nesta
  rodada**: `app/authz.py` e `app/services/propostas_candidatas.py` (únicos consumidores reais de
  erro em Service até então). `app/services/monitoramento_instrumentos.py`/
  `monitoramento_eventos.py` (767 linhas do `monitoramento.py` + services) **ficam de fora** —
  ainda levantam `HTTPException` direto, migração é bloco futuro.
- **Contrato Repository/Service documentado** em `padroes/backend/constituicao_backend.md` Seção
  3 — Repository é função solta com `db: Session` posicional, nunca commita; Service é função
  solta com `db` **keyword-only** (`*, db: Session`), único lugar que commita, levanta
  `DomainError`. Exemplo de referência: `backend/app/repositories/propostas_candidatas.py` +
  `backend/app/services/propostas_candidatas.py`. `monitoramento.py` (commit no Router, 5x) é o
  padrão a **não** seguir — regra vale daqui pra frente, esse arquivo não foi migrado.
- **`notificacoes` migrado como piloto** Router → Service → Repository:
  `backend/app/repositories/notificacoes.py` + `backend/app/services/notificacoes.py` (novos),
  `backend/app/routers/notificacoes.py` ficou fino (só `Depends`, chama Service, devolve
  `response_model`). Contrato HTTP não mudou — mesmos query params, mesmo shape de resposta.
- **`monitoramento.py` — fatia de leitura migrada (2026-09-17, Bloco 3 do Plan Mode consolidação)**:
  `GET /monitoramento/instrumentos` e `GET /monitoramento/instrumentos/{nr_convenio}` seguem o
  mesmo contrato de `notificacoes` — `backend/app/repositories/monitoramento.py` (novo, primeira
  extração de query real deste domínio: `listar_instrumentos`/`listar_marcos_fase_geral_desc`/
  `mapa_eventos_por_instrumento`/`obter_instrumento_por_nr_convenio`/
  `listar_eventos_do_instrumento`) + `backend/app/services/monitoramento_instrumentos.py`
  (`listar_instrumentos_monitorados`/`obter_timeline_instrumento`, já existia pra
  `criar_instrumento_monitorado`). `obter_timeline_instrumento` levanta `NotFoundError` (não mais
  `HTTPException` direto) — mesmo contrato HTTP (`{"error", "detail": None}`, 404). Escrita
  (eventos/ações, `atualizar_cadastro`) e `obter_resumo` **ficam de fora** desta fatia — próximo
  bloco futuro, mesmo padrão "uma fatia por PR" do piloto `notificacoes`.
- **3 schemas mortos removidos** de `backend/app/schemas.py`: `ErrorResponse`, `UserCreate`,
  `TokenPayload` — zero consumidor real, reconfirmado por grep antes de remover.
- **`ruff`/`mypy` com baseline** em `backend/pyproject.toml` — config mínima (`E`/`F`/`I` no ruff,
  sem `strict` no mypy), baseline versionada ignora achado legado; código novo (`domain_errors.py`,
  `repositories/notificacoes.py`, `services/notificacoes.py`) nasce sem exceção na baseline.

**Teto de segurança nas listas sem paginação de UI (2026-09-17, Bloco 4 do Plan Mode
consolidação)**: `macro-coverage`, `municipality-coverage`/`health-region-coverage`,
`monitoramento/marcos`/`instrumentos`/`acoes` ganharam `limit: int = Query(default=X, le=X)` —
volume atual de cada uma é bem menor que o teto (ex. 86 instrumentos monitorados, teto 500;
~5570 municípios do Brasil, teto 10_000), então o comportamento observado não muda, só existe
uma rede de segurança contra uma lista sem limite nenhum se o dado crescer. Isso **não é**
paginação de UI real (sem `offset`/cursor de navegação) — `equipment-offer` (`GET
/equipment-offer`, `/establishments`) já tinha paginação real (`limit`/`offset` +
`total`) antes deste bloco, não precisou mudar. `/equipment-offer/facilities` ganhou teto
(20_000) sem expor query param — é "lista completa" por design (dropdown bidirecional do
frontend), o teto é só rede de segurança invisível.

Fora de escopo deste Plan Mode (registrado como blocos futuros no diagnóstico): migrar
`monitoramento.py` (escrita — eventos/ações — e `obter_resumo`)/coberturas/ofertas/convênios
completos para Router→Service→Repository, envelope de resposta unificado (`{success, data,
meta}` — mudança breaking, coordenar com frontend), paginação real (`offset`/cursor, distinta do
teto de segurança acima) e observabilidade estruturada (logs JSON, `trace_id`, duração). CSRF em
autenticação por cookie foi resolvido em 2026-09-17 (ver "Segurança e sessão" abaixo).

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
  revoga no servidor (não só limpa cookie). `rotate_refresh_token`/
  `revoke_refresh_token` (`backend/app/auth.py`) usam `UPDATE ... WHERE
  revoked_at IS NULL RETURNING ...` atômico, não `SELECT` + atribuição +
  `commit()` (Plan Mode database 2026-09-17, Bloco 1 — duas requisições
  concorrentes com o mesmo token não geram mais dois sucessores do mesmo
  token pai). **Bearer fallback removido em 2026-09-17** (Bloco 2 do Plan
  Mode consolidação — `require_current_user` só aceita cookie agora;
  confirmado com o usuário que não há consumidor de API além do frontend
  Vercel, e os 3 clientes HTTP já operavam só por cookie). `/auth/login`/
  `/auth/refresh` também pararam de devolver `access_token` no corpo —
  só `{"status": "ok"}`, a sessão inteira vive nos cookies. `JWT_SECRET`
  vazio/curto (<32 chars) derruba o **boot**, não só a primeira request
  (`Settings._validar_jwt_secret`, `backend/app/config.py`). Rate limit
  (`slowapi`, `backend/app/rate_limit.py`) em `/auth/login` (5/min) e
  `/auth/refresh` (30/min) — é in-memory por processo (`app/rate_limit.py`),
  então testes de integração que abrem muitos logins na mesma sessão do
  pytest competem pela mesma janela (`limiter.reset()` depois de um teste
  que a esgota de propósito, ver `test_auth_session.py::
  test_rate_limit_no_login`).
- **CSRF (Bloco 1 do Plan Mode consolidação 2026-09-17)**: double-submit
  cookie — `sigeo_csrf` (não `HttpOnly`, legível por JS) emitido junto da
  sessão em `set_session_cookies` (`backend/app/auth.py`); toda rota
  mutável (`POST`/`PUT`/`PATCH`/`DELETE`, exceto `/auth/login`/`/health`)
  exige o header `X-CSRF-Token` batendo com o cookie —
  `backend/app/main.py::csrf_middleware`, global (não dependency por
  rota, pra não depender de lembrar de anotar cada router novo). Frontend
  anexa o header via `frontend/src/lib/csrf.ts::csrfHeaders()`, chamado
  pelos 3 clientes HTTP (`api.ts`/`convenios.ts`/`monitoramento.ts`) em
  toda chamada mutável e no retry de `/auth/refresh`. Testado em
  `backend/tests/test_csrf.py` (403 sem header, 403 com header
  divergente, 200 com header correto — `/auth/refresh`, `/auth/logout`,
  PATCH de monitoramento). **Bug real encontrado ao escrever esse
  teste**: `REFRESH_COOKIE_PATH` era `/auth/refresh` — Path de cookie é
  matching de prefixo, então esse cookie nunca chegava numa requisição
  pra `/auth/logout` (paths irmãos), e o logout nunca revogava nada de
  verdade no servidor apesar do Bloco 2 dizer que sim. Corrigido pra
  `/auth` (prefixo cobre `/auth/refresh` e `/auth/logout`).
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
  documentado na época (2026-09-16): `UserRole` era `admin`/`colaborador`/
  `leitor`, gate binário (`admin`==`colaborador`). **Atualizado**: `gestor`
  foi adicionado em 2026-09-25 (Bloco 10 do Plan Mode fechamento final,
  mesmos poderes de `colaborador`) e a autorização por titularidade de
  instrumento (2026-09-26, ver seção própria abaixo) fechou parte desta
  pendência — `admin`/`gestor` continuam idênticos entre si e editando
  qualquer instrumento, mas `colaborador` agora só edita o instrumento onde
  é titular/suplente designado. Escopo por UF/órgão continua **decisão de
  produto pendente**, não implementado.
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

## Gestão de usuários (Módulo Admin, 2026-09-17)

Antes deste módulo, a única forma de criar/editar um usuário era rodar `backend/scripts/
criar_usuario.py` manualmente no servidor — sem API, sem tela, sem RBAC real (`admin`/`colaborador`
eram idênticos em poderes), sem auditoria (`AuditLog` existia na tabela desde a base do projeto,
zero uso no código) e sem bloqueio de conta (só rate limit por IP em `/auth/login`). Login/sessão em
si **não foi reconstruído** — já era maduro (JWT + refresh cookie rotativo + CSRF + rate limit,
Plan Mode segurança 2026-09-16/17, ver seção acima); este módulo fechou especificamente a lacuna de
gestão de usuários, seguindo o mesmo padrão Router → Service → Repository de `notificacoes`.

- **RBAC real, só para este módulo**: `require_admin_user` (`app/auth.py`) e `assert_e_admin`
  (`app/authz.py`, chamado dentro do Service — não só `Depends`) exigem `role=admin`. Primeira
  checagem real de `UserRole.admin` no código — o resto do app continua no gate binário
  (`leitor` bloqueado, `admin`/`colaborador` idênticos), decisão de produto ainda pendente para
  qualquer diferenciação além deste módulo.
- **CRUD em `backend/app/routers/usuarios.py`** (`GET/POST /usuarios`, `PATCH /usuarios/{id}`,
  `POST /usuarios/{id}/enviar-redefinicao`, `POST /usuarios/{id}/{in,re}ativar`) — regra de negócio em
  `app/services/usuarios.py`, query em `app/repositories/usuarios.py`. Frontend em
  `frontend/src/pages/usuarios-page.tsx` (rota `/admin/usuarios`, atrás de `AdminRoute`, distinto de
  `ProtectedRoute` — checa `role`, não só sessão) + `components/features/usuario-*.tsx`.
- **Redefinição por e-mail** (Segurança, 2026-09-22): administrador dispara link de uso único;
  senha nunca é devolvida pela API, exibida na tela ou incluída em URL. O token fica no fragmento
  do link e só segue no corpo do POST de ativação/redefinição. **Prazo do link ampliado de 30min pra
  7 dias em 2026-09-26** (`activation_expires_at`, 4 pontos: `auth.py` self-service +
  `usuarios.py` convite/reenvio/redefinição) — 30min era curto demais na prática (convite chegando
  fora do expediente). Contrato do gateway (`app/email.py::enviar_link`) mudou pra
  `to`/`subject`/`fromName`/`html` (não mais `subtitle`/`body`) e o HTML foi redesenhado (paleta/
  tipografia do SIGEO, CTA específico por contexto — "Ativar minha conta" vs "Redefinir senha",
  tabelas + estilo inline pra compatibilidade Gmail/Outlook/Apple Mail). **Achado real
  2026-09-25**: `MAIL_API_URL`/`MAIL_API_SECRET`/`APP_PUBLIC_URL` nunca tinham sido configuradas no
  Render de produção (só existiam no `.env` local) — sem `APP_PUBLIC_URL`, o link do e-mail cairia
  em `localhost:5173` mesmo com o gateway funcionando. As 3 adicionadas manualmente no dashboard do
  Render; testado ao vivo (envio real de redefinição) depois do redeploy.
- **Perfil `gestor` faltava no formulário de criar usuário** (achado 2026-09-26):
  `usuario-form-criar.tsx` só listava admin/colaborador/leitor desde que `gestor` foi criado
  (2026-09-25) — corrigido lá e no filtro de `usuarios-page.tsx`.
- **Auto-proteção**: um admin não pode remover o próprio papel de admin nem se auto-inativar via
  este módulo (`atualizar_usuario`/`inativar_usuario` em `services/usuarios.py`) — evita lockout
  acidental do sistema por engano do próprio admin.
- **Inativação revoga sessão de verdade**: `revoke_all_refresh_tokens_for_user` (`app/auth.py`)
  revoga em lote os refresh tokens do usuário — sem isso uma sessão já aberta continuaria válida até
  o access token expirar (até `access_token_expire_minutes`) mesmo com a conta inativada.
- **Bloqueio de conta** (além do rate limit por IP já existente): `User.failed_login_attempts`/
  `locked_until` (migration `01a01055b1af`) — 10 falhas seguidas bloqueiam a conta por 15min, mesmo
  vindo de IPs diferentes/rotativos. Mensagem de erro em conta bloqueada é a mesma genérica de
  credencial inválida (não sinaliza pro atacante que acertou o e-mail).
- **`AuditLog` ativado** — `registrar_auditoria` em `services/usuarios.py` grava toda ação de
  escrita (criar/editar/resetar senha/inativar/reativar) com `user_id` do admin que executou.
  **Achado 2026-09-26**: a promessa deste bullet ("generalizar pra `app/audit.py` quando um segundo
  consumidor precisar") já devia ter acontecido — `app/audit.py::log_action` existe desde o Plan Mode
  backend 2026-09-17 e já é usado por `monitoramento_eventos.py`; `registrar_auditoria` continua
  sendo um segundo helper quase idêntico, nunca consolidado. **Gap maior, ainda não corrigido**: nem
  `AuditLog` nem nenhuma outra tabela registram login (sucesso ou falha) ou aceite de convite —
  `POST /auth/login`/`/auth/ativar` (`app/routers/auth.py`) não chamam nenhuma auditoria;
  `registrar_sucesso_login` (`app/auth.py`) só zera `failed_login_attempts`/`locked_until`, sem
  deixar rastro histórico. `User.activated_at` é setado na ativação, mas não é exposto em
  `UserRead` nem na tela `/admin/usuarios` — hoje não dá pra saber, sem consultar o banco direto, se
  um convite foi aceito. Relacionado ao P1 "logs e auditoria" já aberto em
  `diagnostico-constituicao-seguranca-2026-09-16.md` (item 4, sobre falta de alerta de 401/403
  anormal) — esse diagnóstico não deixava explícito que não existe histórico nenhum de login pra
  alertar sobre coisa nenhuma.
- `scripts/criar_usuario.py` continua existindo (bootstrap do primeiro admin antes de qualquer
  usuário existir via UI) — não foi removido, mas deixou de ser o único caminho.

## Plan Mode frontend (reavaliação 2026-09-17)

`docs/arquitetura/diagnostico-constituicao-frontend-2026-09-16.md` (reescrito como "Reavaliação —
2026-09-17") reauditou o frontend contra `padroes/frontend/constiuicao_frontend.md` — nota de
conformidade **7,2/10** após os Blocos 0/1/2, nota separada de **UI/UX 5,8/10** de uma auditoria
visual sênior autenticada em 8 rotas × 3 breakpoints (1440/768/400px). `docs/arquitetura/
planmode-frontend-2026-09-17.md` formaliza o roadmap de correção em blocos, executados um de cada
vez (mesma cadência dos Plan Mode backend/segurança — nunca "refatoração completa" numa tacada só).

**Blocos 0, 1 e 2 executados no mesmo dia da reavaliação (2026-09-17)**:
- **Bloco 0 (build/lint/tipos)**: `Modal.tsx`/`Pagination.tsx` renomeados pra kebab-case
  (`modal.tsx`/`pagination.tsx`, resolvia `TS1261`); tipos manuais de `monitoramento-{overview,
  painel}-page.tsx` substituídos por `z.infer` dos schemas de `services/monitoramento.ts`
  (resolvia `TS2345`); 15 warnings de lint corrigidos; `.card-group`/`.table-editorial`/
  `.meta-grid`/`.kpi-row` removidos de `index.css` (zero consumidor confirmado por grep);
  `EmailStr` (`backend/app/schemas.py`) trocado por validador próprio que aceita `.local`.
- **Bloco 1 (transporte HTTP único)**: `frontend/src/lib/http-client.ts` concentra o que estava
  triplicado em `api.ts`/`convenios.ts`/`monitoramento.ts` — 1 mutex de refresh (não mais 3), CSRF,
  retry único, redirect em 401 definitivo, `ApiError` — 12 testes novos (`http-client.test.ts`).
- **Bloco 2 (docs)**: `AGENTS.md` reescrito pra espelhar a estrutura flat real (não mais
  `src/features/<nome>/index.ts`).

**Bloco 3 (app shell responsivo, Etapa 3 do plan-mode, executado 2026-09-17)**: o P0 visual
documentado ("header não tem comportamento responsivo, quebra em 400px e 768px em todas as
rotas") foi fechado. `AppHeader` (`frontend/src/components/layout/app-header.tsx`) colapsa
nav/`leftExtra`/`rightExtra`/`UserMenu` num menu mobile (`Sheet` do shadcn, `npx shadcn add sheet`)
abaixo de `lg` (1024px) — testado que em exatamente 768px o nav completo de 4 itens não cabia
numa linha só sem quebrar pra fora dos 56px do header (`md`/768px não bastava como corte, só
`lg`/1024px resolvia de verdade). Container/gutter (`max-w-[1400px] px-6`), antes duplicado 3x em
`app-header.tsx`/`app-layout.tsx`/`monitoramento-layout.tsx`, virou `CONTAINER_CLASS`
(`frontend/src/lib/layout.ts`). `NavBoxesAnaliseMerito` (cards "Ir para" do cabeçalho de Dashboard/
Mapa/Relatórios) empilha em 1 coluna abaixo de `sm` (640px) — antes fixo em 3 colunas, estourava em
400px. Verificado ao vivo (dev server + Chrome, login real): 1440px sem mudança visual, 768px
mantém o header numa linha só com hambúrguer funcional (abre, navega, fecha), ~500px (o mínimo que
a janela do Chrome aceita — mais perto de 400px do que 768px) confirma que o **header** não gera
overflow (492px de conteúdo dentro de 500px de viewport); overflow de página ainda presente em
Painel Geral/Dashboard/Relatórios nesse teste vem do **conteúdo** das páginas (grid/filtros), não
do header — é escopo dos Blocos seguintes (Etapas 5/6 do plan-mode), não deste bloco.

**Higiene do mesmo bloco**: `components/common/modal.tsx` (wrapper fino sobre `Dialog`) removido —
os 3 consumidores (`municipio-detalhe-modal.tsx`, `modals/export-{xlsx,pdf}-modal.tsx`) usam
`<Dialog>/<DialogContent>` direto agora. `.table-scroll`/`.kpi` (+ `.label`/`.value`/`.sub`)
removidos de `index.css` (zero consumidor, nunca tiveram adoção real). Comentários de histórico
datado ("achado 2026-09-XX, pedido do usuário: '...'") podados em `services/{api,convenios,
monitoramento}.ts`, `pages/monitoramento-{overview,painel}-page.tsx`, `convenio-card-header.tsx` e
`monitoramento-interno-cabecalho.tsx`, mantendo só o WHY local (a narrativa de quem pediu o quê já
vive no histórico de decisões deste arquivo, não precisa duplicar no código).
`secao-propostas-candidatas.tsx` tem os mesmos comentários datados mas foi deixado de fora de
propósito — é alvo de split completo na Etapa 5, reescrever comentário ali agora seria descartado
na mesma rodada em que o arquivo for dividido.

- **Transporte HTTP unificado, mensagem de erro ainda não separada (P1 #4, pendente)**: o Bloco 1
  normalizou onde a mensagem de erro nasce (1 lugar em vez de 3), mas não introduziu a separação
  entre mensagem segura pro usuário e detalhe técnico de contrato — várias telas ainda exibem
  `error.message` direto.
**Bloco 4 (fundação visual, executado 2026-09-17)**: `PageHeader`/`FilterWorkspace`/`DataSurface`/
`MetricStrip`/`OperationalDetailSection`/`EmptyState`/`ErrorAlert` criados em `frontend/src/
components/common/` + primitivas shadcn `Skeleton`/`Alert`/`Sonner` (toast global em `App.tsx`,
tema fixo light — `next-themes` não foi adotado). Só fundação, nenhuma página migrada ainda
(migração real começa na Etapa 5, que também remove os wrappers ad hoc equivalentes no mesmo
bloco em que migra cada consumidor).

**Bloco 5 (pilotos, executado 2026-09-17)**: Dashboard e Mesa de trabalho (`monitoramento-
overview-page.tsx`) migraram cabeçalho/filtros/loading/erro pra `PageHeader`/`FilterWorkspace`/
`ErrorAlert`/`Skeleton` do Bloco 4. Mesa de trabalho parou de fazer `useEffect+useState+
Promise.all` — passou a usar `useMonitoramentoResumo`/`useMonitoramentoInstrumentos` (hooks
TanStack Query que já existiam, só não eram consumidos por essa página ainda).
`secao-propostas-candidatas.tsx` (796 linhas) dividido em `lib/proposta-metas-resumo.ts` +
`proposta-card.tsx` + `proposta-linha-do-tempo.tsx` + `proposta-detalhe-bruto.tsx`; novo helper
`campoObjeto` em `lib/campo-cru.ts` — `Record<string, unknown>` cru fica confinado a
`campo-cru.ts`/`proposta-metas-resumo.ts`, nunca mais tocado direto em JSX de componente
(`monitoramento-painel-page.tsx` continua com `useEffect+Promise.all` — fica pra Etapa 7).

**Bloco 6 (rotas analíticas, executado 2026-09-17)**: Mapa e Relatórios migraram cabeçalho pra
`PageHeader`; Painel Geral (fora de layout, sem `PageHeader` aplicável) passou a usar
`CONTAINER_CLASS`. Fix real do P0 de overflow em 400px da auditoria: grid de cards do Painel
Geral (`minmax(480px,1fr)`, causava 504px de `scrollWidth`) virou `minmax(min(480px,100%),1fr)`;
grid do Mapa (`grid-cols-[2fr_1fr]`, painel lateral virava coluna de ~120px) virou `grid-cols-1
lg:grid-cols-[2fr_1fr]`; `CardExportar` de Relatórios (dois cards lado a lado, 434px) virou
`flex-col sm:flex-row`. `ExportPdfModal`/`ExportXlsxModal` (jspdf+exceljs, ~1,3MB) viraram
`lazy()`/`Suspense` — chunk de `relatorios-page` caiu de 35,79kB pra 11,20kB gzip. Dashboard
(517px de overflow) **continua pendente** — a causa é um bloco de filtros do conteúdo, não do
shell, fica pra revisão de página específica.

**Bloco 7 (Monitoramento, executado 2026-09-17)**: Painel de Gestão parou de fazer `useEffect+
useState+Promise.all` — migrou pra `useMonitoramentoResumo`/`useMonitoramentoInstrumentos`/
`useMonitoramentoMarcos` + `useConveniosLista` (hook novo, mesma `queryKey` `['convenios-lista']`
que `monitoramento-equipamentos-page.tsx` já usava inline — os dois consumidores agora
compartilham cache). Cabeçalho das 3 telas (Dados oficiais, Painel de Gestão, Detalhe) migrado
pra `PageHeader` (`PageHeader` já suporta `breadcrumb`, usado no Detalhe). `OperationalDetail
Section` (Bloco 4) agrupa Fase/cronograma, Ações e Linha do tempo de eventos na página de
Detalhe, fechando o achado "página muito longa sem índice local ou agrupamento progressivo" —
Cabeçalho/Cadastro continuam sempre visíveis. 2 usos de emoji "⚠️" como ícone de erro trocados
por `ErrorAlert`.

**Bloco 8 (contratos, parcial, executado 2026-09-17)**: `services/monitoramento.ts` (457 linhas,
23 consumidores) dividido em `auth.ts`, `monitoramento-{marcos,instrumentos,acoes,resumo}.ts`,
`notificacoes.ts`, `propostas-candidatas.ts`, `cnes-referencia.ts` + `monitoramento-client.ts`
(helpers `apiGet`/`apiGetAuthed`/`apiAuthed` compartilhados). `ApiError` ganhou `publicMessage`
(Seção 17 — mensagem segura pro usuário, separada do detalhe técnico em `.message`) + helper
`mensagemSeguraDoErro()`, substituindo todo `error.message` renderizado direto na UI. Paginação/
`total`/virtualização **não fechado** — bloqueado no backend não devolver `total`/`meta` (envelope
de resposta unificado, mudança breaking que precisa de Plan Mode coordenado); nenhuma lista real
do app hoje chega perto do teto de segurança do backend pra justificar virtualização client-side
sem isso.

**Bloco 9 (acessibilidade, parcial, executado 2026-09-17)**: os 13 cabeçalhos ordenáveis sem
semântica (`cobertura-table.tsx`/`nivel-cobertura-table.tsx`/`estabelecimento-table.tsx`) viraram
`SortableTableHead` (`frontend/src/components/common/sortable-table-head.tsx`, novo) — `<button>`
real + `aria-sort`, testado ao vivo. Auditoria completa de WCAG AA (contraste, foco tab-a-tab,
labels) **não executada** — fica pra rodada dedicada.

**Bloco 10 (testes, parcial, executado 2026-09-17)**: `jsdom`+`@testing-library/react`+
`jest-axe` instalados (`vite.config.ts`: `environment: 'jsdom'`, `globals: true`, `setupFiles:
src/test-setup.ts`). 18 testes novos (`EmptyState`/`ErrorAlert`/`PageHeader`/`SortableTableHead`/
`AppHeader` + 1 hook em sucesso/falha) — 14 arquivos/60 testes no total (era 8/42).
`@playwright/test` instalado + `playwright.config.ts` + `e2e/login.spec.ts` (credencial só via
`E2E_EMAIL`/`E2E_SENHA`, nunca hardcoded) — **scaffolded, não executado** (precisa `npx
playwright install chromium`).

**Bloco 11 (CI e performance, executado 2026-09-17)**: `.github/workflows/frontend_ci.yml` (novo)
— dispara em push/PR tocando `frontend/**`, roda `npm ci` (lockfile travado) + lint + typecheck +
test + build, os 4 gates que já rodavam manualmente antes de todo PR. E2E fica fora do workflow
(precisa de backend rodando + credencial de teste, infraestrutura que a CI ainda não tem).
`build.chunkSizeWarningLimit` subiu de 500kB pra 1MB (documentado no `vite.config.ts`) — os únicos
2 chunks que passam de 500kB (jspdf/exceljs) são `lazy()` desde o Bloco 6, nunca entram no
carregamento inicial. Verificado ao vivo: `npm ci` limpo reproduzindo exatamente o que a CI roda.

**Bloco 12 (higiene final, executado 2026-09-17)**: varredura de arquivo-sem-importador (heurística
por grep) achou `data-surface.tsx`/`metric-strip.tsx` (fundação do Bloco 4) sem consumidor real —
`MetricStrip` foi cabeado no Dashboard (substituiu os 5 `KpiCard` soltos, testado ao vivo, visual
idêntico); `DataSurface` **removido** (nenhum ponto de encaixe de baixo risco sem tocar lógica de
página). `useJson.ts` (hook pré-existente, não desta rodada) também aparece sem importador —
registrado como candidato, não removido sem confirmar com mais busca.

Com isso, **as Etapas 1-12 do `planmode-frontend-2026-09-17.md` estão concluídas** (Etapas 8, 9 e
10 parciais, ver detalhe de cada bloco acima). Os itens explicitamente bloqueados (E2E de fato
executado — decisão do usuário, falta `npx playwright install chromium`; paginação/virtualização
real — mudança de contrato do backend) ficam pra uma rodada futura, fora do que este Plan Mode
decide sozinho.
  Cópia desatualizada `frontend/constiuicao_frontend.md` (2026-09-15 09:06, sem a Seção 18-Testes
  e o checklist de segurança expandido do `padroes/frontend/constiuicao_frontend.md` real) foi
  removida a pedido do usuário — só o arquivo em `padroes/` é a fonte de verdade.

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

## Notificações: escopo por destinatário + alerta de vigência (Plan Mode notificacoes-escopo 2026-09-25)

`docs/arquitetura/planmode-notificacoes-escopo-2026-09-25.md` fechou o que `authz.py` já registrava
como pendência desde o Plan Mode segurança ("recorte de visibilidade por colaborador... quando a
política de acesso por instrumento" existir): `Notificacao.lida` deixou de ser um boolean único
compartilhado por toda a equipe e virou uma tabela nova, `NotificacaoDestinatario` (`notificacao_id`
+ `usuario_id` + `lida` individual), materializada no momento da CRIAÇÃO da notificação (não em
tempo de leitura) por `app/repositories/notificacoes.py::criar_notificacao` — todo ponto que cria
`Notificacao` (os 3 jobs de verificação/descoberta + `monitoramento_eventos.py`, camada
`edicao_manual`) passa por essa função agora, nunca `db.add(Notificacao(...))` direto.

- **Regra de escopo** (`resolver_destinatarios`): `atualizacao_api`/`edicao_manual` (`entidade_id` =
  `InstrumentoEquipamento.id`) vão pra titular + suplente (`InstrumentoResponsavel`, já existente
  desde antes deste plan-mode) **união** todo `gestor`/`admin` ativo — `gestor`/`admin` recebem
  TUDO, independente de estarem designados. Sem titular/suplente cadastrado, cai no broadcast (todo
  `colaborador`/`gestor`/`admin` ativo) — mas na prática esse fallback quase nunca dispara, porque
  gestor/admin já tornam o conjunto não-vazio (só dispara se não houver NENHUM gestor/admin ativo no
  sistema). `proposta_candidata` (nunca tem instrumento monitorado) é sempre broadcast.
  `leitor` nunca entra em nenhum branch, mesmo sendo titular/suplente hipoteticamente.
- **Tipo novo `alerta_vigencia`**: fim de vigência do convênio a 3 meses (`Convenio.
  data_final_vigencia`, `entidade_id` = `Convenio.id`) — job novo `backend/scripts/
  job_alerta_vigencia.py` (janela de 90 dias, dedup de 30 dias pro mesmo convênio, dentro de
  `radar_convenios.yml` junto dos outros 3 jobs). Sem instrumento monitorado pro convênio, dispara
  broadcast (decisão do usuário: proximidade do fim de vigência é relevante mesmo sem técnico
  designado) — com instrumento monitorado, mesma regra de titular/suplente+gestor/admin acima.
- **`Notificacao.lida` (coluna antiga) fica DEPRECATED**, não removida nesta rodada — nenhum código
  novo lê/escreve nela, mantida só pra não quebrar migration em voo. Notificações criadas antes
  desta migration não ganham destinatário retroativo (não dá pra reconstruir quem era titular no
  momento em que cada uma foi gerada) — ficam invisíveis no `GET /notificacoes` escopado, mesmo
  critério já usado noutras migrations deste projeto pra dado legado que não pode ser reconstruído
  com certeza.
- **Migration**: `488a535a0b5e` (tabela `notificacao_destinatario` + `ALTER TYPE notificacao_tipo
  ADD VALUE 'alerta_vigencia'`).
- **Cobertura ampliada pra evento/ação (2026-09-25)**: até aqui só `atualizar_cadastro_instrumento`
  disparava `Notificacao` (`tipo=edicao_manual`) — criar/editar/excluir `EventoMarco`/
  `AcaoMonitoramento` só gravava `AuditLog`, sem notificar ninguém. As 7 funções de escrita restantes
  em `app/services/monitoramento_eventos.py` (`registrar_evento_monitorado`,
  `editar_evento_monitorado`, `excluir_evento_monitorado`, `registrar_acao_monitorada`,
  `editar_acao_monitorada`, `excluir_acao_monitorada`, `concluir_acao_monitorada`) passaram a chamar
  o mesmo helper (`_notificar_edicao_manual`), mesmo tipo/escopo de destinatário de antes.

## Plan Mode fechamento final (2026-09-25)

Auditoria sênior cruzando os 6 diagnósticos mais recentes (`diagnostico-constituicao-*`) contra o
código atual não achou nenhum item Crítico aberto — as pendências reais eram dívida conhecida e
adiada. `docs/arquitetura/planmode-fechamento-final-2026-09-25.md` fechou 11 blocos (0-10) na mesma
sessão; vários se revelaram já satisfeitos ou de escopo menor do que os diagnósticos diziam
(diagnósticos tendem a ficar levemente desatualizados entre uma auditoria e a próxima).

- **Envelope HTTP `{data, meta.total}`** (Bloco 1) — escopo reduzido do que o plano original previa:
  só `EquipmentOfferRowPage`/`EstablishmentPage` (`backend/app/schemas.py`) migraram, únicas duas
  rotas com paginação real (offset/limit de verdade). As rotas cogitadas inicialmente
  (`monitoramento/{marcos,instrumentos,acoes}`, `macro-coverage`, cobertura municipal/regional)
  ficaram de fora — são teto de segurança deliberado (Bloco 4 do Plan Mode consolidação 2026-09-17),
  não paginação de UI, com volume muito abaixo do teto. Migrar `GET /propostas-candidatas` de
  `metas_resumo` pra `evidencia_transferegov` também saiu do escopo: essa tabela relacional
  **não tem nenhum escritor** (só o schema da migration `b7e3d9f4a621`) — migrar o router leria dado
  vazio. Fica registrado como pendência real (precisa de um Plan Mode de ingestão dedicado primeiro),
  não como "adiado por decisão", em `diagnostico-constituicao-backend-2026-09-22.md`.
- **`app/schemas_monitoramento.py`** (novo, Bloco 2) — os 5 Read schemas do resumo de monitoramento
  (`ResumoMonitoramentoRead` e dependentes) saíram de dentro de `routers/monitoramento.py` pra um
  módulo próprio, mesmo padrão já usado por `schemas_equipamentos.py` — evita import circular entre
  o router e o novo `app/services/monitoramento_resumo.py::montar_resumo_monitoramento`, que herdou
  o cálculo de fase atual/distribuição/divergência de conclusão que antes vivia inline no endpoint
  `GET /monitoramento/resumo` (~135 linhas). Achado ao vivo: a fatia de ESCRITA
  (eventos/ações/`atualizar_cadastro`) que o plano original achava que ainda tinha `db.commit()` no
  router **já estava toda decomposta** desde antes deste bloco — o achado do diagnóstico de backend
  estava desatualizado.
- **KDF `argon2id`** (Bloco 6) — `hash_password`/`verify_password` (`app/auth.py`) migraram de
  PBKDF2-HMAC-SHA256 pra argon2id (`argon2-cffi`). Sem reset em massa: hash legado continua sendo
  lido (`verify_password` detecta pelo prefixo `pbkdf2_sha256$`), e é re-hasheado silenciosamente no
  primeiro login bem-sucedido depois do deploy (`precisa_rehash`, chamado em
  `routers/auth.py::login`).
- **`TrustedHostMiddleware`** (Bloco 6) — `app/main.py`, protege contra Host header injection atrás
  de proxy mal configurado. `Settings.allowed_hosts`/`allowed_hosts_lista` (`app/config.py`, default
  `localhost,127.0.0.1,*.onrender.com` — nome do serviço Render, sem domínio customizado hoje).
  `tests/conftest.py` injeta `testserver` só no ambiente de teste (`TestClient` sem `base_url` manda
  esse host por convenção do Starlette) — nunca no default de produção. CSP da API **continua em
  Report-Only**: promover pra enforcement exige relatório real de violação em produção, que a sessão
  que executou este bloco não tinha como observar — fica pendência externa (observabilidade, não
  custo).
- **`equipamento_alias`/`execution_alert` removidas** (Bloco 7) — confirmadas sem consumidor real,
  migration `9c2e4f7a1d38` (`DROP TABLE` + enum `alert_type`). Dataset sintético de desenvolvimento
  (pendente desde 16/09) já existia de fato via `scripts/seed_monitoramento.py` +
  `tests/fixtures_cobertura.py` (ambos já usados por `tests/conftest.py`/`e2e_ci.yml`) — só faltava
  entrypoint standalone (`uv run python -m tests.fixtures_cobertura`, novo) e documentação
  (`backend/README.md`, seção "Dataset sintético de desenvolvimento"). Ensaio `pg_dump`/`pg_restore`
  de migração de servidor ganhou runbook completo em `runbook-devops.md`, mas não foi executado —
  exige `DATABASE_URL_MIGRATION` real do Neon.
  - **Incidente real causado por este bloco, corrigido em 2026-09-25/26**: o entrypoint novo foi
    "testado" (`uv run python -m tests.fixtures_cobertura`) sem sobrescrever `DATABASE_URL`, e como
    o `.env` do repo aponta pro Neon de produção, o seed sintético (`__pytest_cobertura_tomografo__`)
    gravou direto em produção — `Competency`/`Execution` com `started_at` de hoje, `status=published`,
    mas **sem** setar `Competency.published_execution_id`. `_latest_execution_id` (triplicada em
    `macro_coverage.py`/`equipment_offer.py`/`municipality_coverage.py`) escolhia "a execução mais
    recente" só por `Execution.started_at`, então a execução sintética virou "a atual" de TOMOGRAFO em
    toda a Análise de Mérito (Dashboard/Mapa/Relatórios), substituindo 8.284 linhas reais por 3
    fictícias. Corrigido: `app/repositories/execucoes.py::obter_execucao_publicada_mais_recente`
    (nova, substitui a triplicação) só aceita a execução que É o ponteiro `published_execution_id` da
    sua competência — isola qualquer dado avulso, mesmo com `status=published`/`started_at` recente.
    `app/db/seed_guard.py::recusar_se_producao()` bloqueia `fixtures_cobertura.py`/
    `seed_monitoramento.py` de rodar se `DATABASE_URL` apontar pro Neon; `README.md` corrigido pra
    instruir `DATABASE_URL` local antes do seed. Dados sintéticos poluídos (competency/execution/
    equipment_offer_row/macro_coverage/municipality_coverage/1 convênio/1 CNES fictícios) removidos
    manualmente do Neon. Regressão coberta em `tests/test_execucoes.py`.
- **Saneamento PERSUS** (Bloco 8) — achado ao vivo: `scripts/reconstruir_fases_monitoramento.py` e
  `scripts/complementar_persus_monitoramento.py` já existiam e já tinham rodado no mesmo dia
  (25/09), antes da auditoria que originou este plan-mode (ver "Correção geral de fases..." acima).
  Nenhum script novo necessário.
- **Decisão sobre o papel `gestor`** (Bloco 10) — decisão do usuário: 4 papéis globais
  (`admin`/`gestor`/`colaborador`/`leitor`) bastam por agora. Granularidade de autorização por
  UF/técnico/órgão fica fora, sem plan-mode dedicado aberto — só revisitar sob demanda real de
  produto, não implementar por antecipação.
- **Paginação real no frontend / E2E no CI** (Blocos 3 e 4) — achados ao vivo: ambos já estavam
  satisfeitos antes deste plan-mode. `estabelecimento-table.tsx` já usa `useEstabelecimentosPage`
  com paginação real ponta a ponta; `.github/workflows/e2e_ci.yml` já dispara em push/PR tocando
  `frontend/**` (workflow separado de `frontend_ci.yml`, por isso a auditoria original, que só
  checou este último, concluiu erroneamente que o E2E não rodava em CI).
- **Itens de custo/infra permanecem fora** (rate limit distribuído sem Redis provisionado,
  staging/registry, PITR>6h, cold start do Render, CodeQL nativo, matriz LGPD) — documentados no
  plan-mode, nenhum implementado sem decisão explícita de orçamento/produto.

## Autorização por titularidade no monitoramento interno (2026-09-26)

Pedido do usuário, fechando parte da pendência já registrada em "Segurança e sessão" (Bloco 3) e no
Bloco 10 do Plan Mode fechamento final: **colaboradores continuam visualizando** qualquer instrumento
(rotas `GET` nunca tiveram escopo por instrumento, não mudou), mas **só editam** (cadastro/evento/
ação) os instrumentos onde são o técnico titular ou suplente designado
(`InstrumentoResponsavel`). `admin`/`gestor` continuam editando qualquer um; `leitor` continua
bloqueado de tudo, sem exceção, em qualquer um dos dois gates abaixo.

- **`app/authz.py`**: `assert_pode_editar_monitoramento` (gate grosso, só bloqueia `leitor`)
  **não muda** — continua a única checagem em `criar_instrumento_monitorado`
  (`monitoramento_instrumentos.py`), porque na criação ainda não existe instrumento pra checar
  titularidade. Novo par de funções puras (sem DB, testáveis direto):
  `usuario_pode_editar_instrumento(usuario, ids_responsaveis) -> bool` e
  `assert_pode_editar_instrumento(usuario, ids_responsaveis)` — `admin`/`gestor` sempre `True`;
  `colaborador` só `True` se `usuario.id` está em `ids_responsaveis`, **ou** se o conjunto está vazio
  (instrumento "sem técnico" ainda, ~38% do universo hoje — decisão do usuário: fica liberado pra
  qualquer colaborador em vez de travar a configuração inicial).
- **`app/services/monitoramento_eventos.py`**: as 8 funções de escrita (cadastro + as 7 de evento/
  ação já listadas na seção de Notificações acima) foram reordenadas pra carregar a entidade (com o
  404 que já existia) **antes** de autorizar — as 5 que só recebem `evento_id`/`acao_id` (não
  `nr_convenio` direto) precisaram inverter a ordem que tinham desde sempre.
- **`app/repositories/notificacoes.py::obter_ids_responsaveis_do_instrumento`** (extraída de
  `_ids_titular_suplente_e_gestores`, que já fazia essa query inline) é a fonte compartilhada dos
  `usuario_id`s de titular/suplente — usada tanto pela autorização quanto pelo escopo de notificação.
  **Não pôde viver em `app/repositories/monitoramento.py`** (mais natural à primeira vista) porque
  esse módulo já importa de `notificacoes.py` (`criar_notificacao`) — importar de volta criaria ciclo.
  `monitoramento.py::mapear_responsaveis_por_instrumentos` é a versão em lote, só pra listagem.
- **`InstrumentoEquipamentoRead.pode_editar: bool`** (`app/routers/monitoramento.py`, default `True`,
  mesmo padrão de `fase_atual` — calculado por request via `model_copy`, não é coluna) em
  `GET /monitoramento/instrumentos` e `GET /monitoramento/instrumentos/{nr_convenio}`. Frontend
  (`monitoramento-interno.tsx`) trocou as 3 ocorrências de `podeEditar={sessao.podeEditar}` (role
  global) por `podeEditar={inst.pode_editar}` (por instrumento, já embute a regra de `leitor`
  também) — `sessao.podeEditar` continua usado só onde não há instrumento ainda (botão de criar).
- **Validado contra dado real de produção antes de fechar**: dos 121 instrumentos monitorados, 75 já
  tinham `InstrumentoResponsavel` populado (quase idêntico aos 76 com `tecnico_titular` em texto) —
  só 1 (`202500044035`, técnico "GUSTAVO") tem texto sem vínculo relacional, porque o nome não está
  no dicionário fechado `_EMAIL_RESPONSAVEL_POR_TEXTO` (`monitoramento_eventos.py`) que sincroniza
  texto→relacional; fica em fail-open até alguém corrigir a mão ou ampliar o dicionário — lacuna de
  dado pré-existente, não introduzida por esta mudança.
- **Testes**: `tests/test_authz.py` (novo, 7 casos puros da regra) + integração em
  `test_monitoramento.py` (colaborador titular/não-titular, instrumento sem titular, `pode_editar` na
  listagem via router).

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

`ruff check .`/`mypy .` (Plan Mode backend 2026-09-17, Bloco E) ainda não bloqueiam CI — rodar à
mão antes de PR em arquivo tocado; achado fora de `.ruff-baseline.json`/`.mypy-baseline.json` é
regressão nova, achado dentro é legado conhecido (não corrigir sem pedir, pode ser escopo maior).

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
