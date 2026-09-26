# Plan Mode — geração de relatórios Excel/Word (2026-09-25)

## Objetivo e decisão de escopo

Pedido do usuário: gerar relatórios em **Excel (.xlsx)** e **Word (.docx)**, em dois níveis —
**Simplificado** e **Completo** — filtráveis por **Brasil, Região, UF, Município e CNES**.

Decisões tomadas com o usuário (2026-09-25, antes de codar):

1. **Escopo de dado é tudo**: cobertura/déficit oncológico, convênios firmados (SICONV/
   TransfereGov) e monitoramento interno pós-repasse — os 3 domínios, não só um. Um relatório é
   composto por seções (uma por domínio), todas filtradas pelo mesmo filtro geográfico.
2. **Geração roda no backend do SIGEO** (`backend/app/`) — decisão explícita de **não** reutilizar
   o backend do projeto irmão `nota-informativa-decan` (avaliado e descartado, ver "Achados"
   abaixo).
3. **Região do Brasil (Norte/Nordeste/Sul/Sudeste/Centro-Oeste) vira dado oficial do backend** —
   hoje só existe hardcoded no frontend (`geo-reference.ts`), usado apenas como label de UI.

## Achados da verificação sênior (antes de desenhar)

- **Não existe nenhuma infraestrutura de export no backend hoje**: `openpyxl` já é dependência
  (`backend/pyproject.toml`), mas só usado nos scripts de importação para **ler** planilha —
  nenhum uso pra gerar arquivo. `python-docx`/`xlsxwriter`/`reportlab` não estão no projeto.
  Nenhuma ocorrência de `StreamingResponse`/`FileResponse` em `app/`.
- **O único export que existe hoje é 100% client-side e está desabilitado**:
  `frontend/src/components/modals/export-{xlsx,pdf}-modal.tsx` (usam `jspdf`+`exceljs`, lazy-
  loaded), acionados por `relatorios-page.tsx` — os dois cards estão com `desabilitado` desde
  2026-08-24. Escopo é só cobertura + estabelecimentos (mesma família de equipamento do
  dashboard); nada de `Convenio`/`InstrumentoEquipamento`/monitoramento.
- **`nota-informativa-decan` já resolve o mesmo tipo de problema em produção** (`.docx` via
  `python-docx`, `.xlsx` via `openpyxl`, filtros combináveis por UF/município/CNES/tipo de
  gestão) — mas é outro repositório, outra infra (AWS Lambda + Mangum + S3, `api.py`), outra
  fonte de dado (DuckDB sobre parquets de produção SUS, nada a ver com o Postgres do SIGEO), e a
  API dele **não tem nenhum gate de autenticação visível**. O SIGEO colocou toda rota atrás de
  sessão/CSRF desde o Plan Mode segurança 2026-09-16/17 — compartilhar backend/deploy exigiria
  expor o Postgres do SIGEO fora do Render em direção a essa Lambda, ou duplicar login/CSRF lá,
  sem ganho real (domínios de dado totalmente diferentes). **Decisão: reaproveitar a técnica
  (padrões de estilo do `python-docx`/`openpyxl`), não o serviço.**
- **Nenhum mapeamento UF→Região existe no backend**: grep por "regiao"/"Norte"/"Nordeste" em
  `app/` só retorna `Convenio.regiao` (persistida da fonte SICONV/TransfereGov, sem garantia de
  consistência entre Convênio/FAF/TED/PERSUS/PRONON) e o conceito distinto de "macrorregião de
  saúde" (DEMAS/RRAS). O único mapeamento Grande-Região-por-UF é
  `frontend/src/data/geo-reference.ts:10-38`, com comentário explícito no próprio arquivo dizendo
  que não é dado de negócio e não vem do banco.
- **4 routers relevantes ainda não seguem Router→Service→Repository**: `convenios.py`,
  `macro_coverage.py`, `municipality_coverage.py`, `equipment_offer.py` continuam
  Router→SQLAlchemy direto. Nenhum deles filtra hoje por `municipio`/`cnes`/`regiao` de forma
  completa (`convenios.py` só tem `uf` string única; `monitoramento/instrumentos` não tem filtro
  geográfico nenhum).
- **Tetos de segurança existentes não servem pra relatório exaustivo**: `macro-coverage`/
  `health-region-coverage` (`le=1000`), `municipality-coverage` (`le=10_000`),
  `monitoramento/instrumentos`/`acoes` (`le=500`) foram desenhados como rede de segurança pra
  listagem de UI (Plan Mode consolidação 2026-09-17, Bloco 4) — um relatório "Completo Brasil"
  não pode ser truncado silenciosamente por esse teto.

## Desenho técnico

### Bloco 1 — Fundação (região oficial + builders genéricos)

- `backend/app/geo_reference.py` (novo): `REGIAO_POR_UF: dict[str, str]` (27 UFs), espelhando os
  mesmos valores de `geo-reference.ts` — vira a fonte de verdade; o dicionário do frontend passa a
  ser só label de UI, não mais fonte de regra. Sem migration/coluna nova: cada domínio deriva
  região a partir da UF que já possui (`equipment_offer_row.state`, `InstrumentoEquipamento.uf`,
  `Convenio.uf`) via um helper SQLAlchemy `case()` exportado do mesmo módulo, usado direto na
  query — `Convenio.regiao` (coluna existente, da fonte) **não** é usada para filtro, só continua
  exposta como está hoje (informativa).
- `backend/app/reports/xlsx_builder.py` e `docx_builder.py` (novo): builders puros (recebem dado
  já formatado, devolvem `bytes`), sem FastAPI/DB — testáveis isolado. Portam o padrão de estilo
  já provado em produção pelo `nota-informativa-decan` (cor verde/vermelha de variação via
  `RGBColor`, bordas via `oxml`, cabeçalho + largura de coluna + congelar painel no Excel), sem
  importar código do outro repositório.

### Bloco 2 — Repository/Service por domínio + endpoint

- Extração mínima (não migração completa) de função de query nos 4 routers ainda não migrados,
  só o necessário pro relatório: `repositories/convenios.py` (filtro por `municipio`/`cnes`/
  `regiao`, hoje ausente), `repositories/macro_coverage.py`, `repositories/municipality_coverage.py`,
  `repositories/equipment_offer.py` — reaproveitando a query existente de cada router, sem
  reescrever a lógica de negócio.
- `app/services/relatorios.py` compõe as 3 seções (cobertura, convênios, monitoramento) filtradas
  pelo mesmo filtro geográfico hierárquico (Brasil → Região → UF → Município → CNES), no nível
  Simplificado (KPIs agregados + 1 tabela resumo por seção) ou Completo (linhas no grão pedido).
  Nível Completo em `.docx` fica limitado a agregação até UF (evita documento de milhares de
  parágrafos em nível de município/CNES) — granularidade linha a linha fica reservada ao Excel.
- `GET /relatorios?formato=xlsx|docx&nivel=simplificado|completo&escopo=brasil|regiao|uf|municipio|cnes&valor=...`,
  atrás de `require_current_user` (mesmo gate do resto do app). `StreamingResponse` com
  `Content-Disposition: attachment`. GET (não POST) porque é leitura sem mudança de estado — evita
  precisar de header CSRF pra um download e mantém o padrão já usado pelo resto da API.
- Query do relatório usa função própria sem o teto de segurança de UI (documentado como
  intencional: endpoint autenticado, não listagem pública).

### Bloco 3 — Frontend

- Reabilitar `relatorios-page.tsx` (cards desabilitados desde 2026-08-24): formulário de filtro
  real (Região/UF/Município/CNES) + seletor Simplificado/Completo + Excel/Word, chamando o novo
  endpoint via `http-client.ts` (fetch autenticado → blob → download).
- `export-xlsx-modal.tsx`/`export-pdf-modal.tsx` (client-side, `jspdf`+`exceljs`) ficam candidatos
  a remoção quando o novo fluxo cobrir o que eles faziam — decisão de retirada fica pro momento da
  migração real da página, não antecipada aqui.

## Fora de escopo (declarado explicitamente, não esquecer depois)

- **Aba "Mapa" em PDF** (captura do SVG do mapa, existente no export atual) — não tem equivalente
  em Word. Pedido do usuário foi Excel e Word; se quiserem manter uma saída visual do mapa, é
  decisão separada, não assumida aqui.
- **Migração completa Router→Service→Repository** de `convenios.py`/`macro_coverage.py`/
  `municipality_coverage.py`/`equipment_offer.py` — só a fatia mínima de query necessária pro
  relatório é extraída; o resto de cada router continua como está.
- **Persistir `regiao` como coluna** em `equipment_offer_row`/`InstrumentoEquipamento` — resolvido
  via mapeamento em código + `case()` na query, sem migration. Reabrir só se houver necessidade
  real de filtrar por região em SQL fora do contexto de relatório.
- **Compartilhar backend/deploy com `nota-informativa-decan`** — avaliado e descartado (ver
  Achados). Só a técnica de geração foi reaproveitada.

## Ordem de execução

- **Bloco 1 — CONCLUÍDO (2026-09-26)**: `app/geo_reference.py` (mapa `REGIAO_POR_UF` + helper SQL
  `expressao_regiao_por_uf` via `case()`, sem migration/coluna nova) + `app/reports/xlsx_builder.py`
  (`nova_pasta`/`escrever_aba_tabela`/`colorir_variacao`/`gerar_bytes`) + `app/reports/docx_builder.py`
  (`novo_documento`/`adicionar_titulo`/`adicionar_paragrafo`/`adicionar_tabela`/`escrever_variacao`/
  `gerar_bytes`, bordas de tabela via `oxml`, cor de variação via `RGBColor` — mesmo padrão do
  `nota-informativa-decan`, sem importar código de lá). Dependência nova: `python-docx` (`uv add`).
  22 testes novos (`test_geo_reference.py`, `test_reports_xlsx_builder.py`,
  `test_reports_docx_builder.py`), todos puros (sem DB/FastAPI). Suíte completa (274 testes),
  `ruff check`/`ruff format --check`/`mypy .` limpos, pisos de cobertura por camada (`services`
  80%/`repositories` 70%/`routes` 60%) mantidos acima do piso — os builders não entram em nenhuma
  dessas 3 camadas, então não alteram o denominador do gate.
- **Bloco 2 — CONCLUÍDO (2026-09-26)**: extração mínima de query, não migração completa dos 4
  routers (fora de escopo, ver acima). `app/repositories/execucoes.py` ganhou
  `listar_familias_publicadas`; `app/repositories/convenios.py` (novo) e
  `app/repositories/cobertura_relatorio.py` (novo) — filtro por UF/município/CNES sem paginação,
  reaproveitando `Convenio`/`MacroCoverage`/`MunicipalityCoverage`; `app/repositories/
  monitoramento.py::listar_instrumentos` ganhou `ufs`/`municipio`/`cnes` opcionais (retrocompatível,
  default `None`), propagado por `services/monitoramento_instrumentos.py::
  listar_instrumentos_monitorados`. `app/services/relatorios.py` (novo) — `FiltroRelatorio`
  (dataclass frozen, valida por `escopo` no `__post_init__`, levanta `ValidationError`) + 3 seções
  (cobertura, convênios, monitoramento) + `montar_relatorio()` monta `.xlsx` (uma aba por família de
  equipamento + Convênios + Monitoramento) ou `.docx` (cobertura sempre agregada por UF, mesmo no
  nível "completo" — granularidade de município fica só no Excel). Seção de cobertura **não existe**
  para `escopo=cnes` (MacroCoverage/MunicipalityCoverage não têm granularidade por estabelecimento,
  mesma limitação já documentada no CLAUDE.md). `GET /relatorios` (`app/routers/relatorios.py`,
  novo, registrado em `main.py`) — `formato`/`nivel`/`escopo`/`regiao`/`uf`/`municipio`/`cnes` como
  query params, `StreamingResponse` com `Content-Disposition: attachment`, atrás de
  `require_current_user`. 39 testes novos (repository/service/contrato HTTP), suíte completa (296
  testes), `ruff`/`mypy` limpos, pisos de cobertura com folga maior que antes (`services` subiu de
  81,1% pra 82,5%).
- **Bloco 3 — CONCLUÍDO (2026-09-26)**: `relatorios-page.tsx` reabilitada — os 2 cards de exportação
  client-side (`desabilitado` desde 2026-08-24) foram substituídos por `RelatorioGeradorForm`
  (`components/features/relatorio-gerador-form.tsx`, novo): seletor de filtro (Brasil/Região/UF/
  Município/CNES, campos condicionais por escopo), nível (Simplificado/Completo) e 2 botões (Excel/
  Word) que baixam o arquivo via `services/relatorios.ts` (novo — primeiro service do projeto a usar
  `httpFetch` cru em vez de `requisitar`, já que a resposta é binária; `mensagemErroHttp` promovido a
  export de `lib/http-client.ts` pra reaproveitar a extração de erro). `export-{pdf,xlsx}-modal.tsx`,
  `utils/export-{pdf,xlsx}.ts` e `hooks/useRelatoriosDados.ts` **removidos** (único consumidor era
  esta página) — junto com as dependências `jspdf`/`jspdf-autotable`/`exceljs` (`npm uninstall`),
  confirmado sem nenhum outro consumidor antes de remover. `tsc --noEmit`/`oxlint`/`vitest run`
  (113/113)/`vite build` limpos.

- **Bloco 4 — CONCLUÍDO (2026-09-26)**: pedido do usuário de gerar relatório real (São Paulo/SP,
  2023) achou 2 problemas reais que os Blocos 1-3 não cobriam:
  - **Bug de município**: filtro exato (`==`) nunca batia porque a mesma cidade tem grafia
    diferente por origem no banco real -- confirmado ao vivo: `convenio`/`instrumento_equipamento`
    gravam "SAO PAULO" (maioria) e "São Paulo" (só PERSUS I); `municipality_coverage` grava "SAO
    PAULO"; `proposta_candidata` grava "SÃO PAULO". Cogitada extensão `unaccent` do Postgres, mas o
    Neon de homologação está com a migration **atrasada e travada por permissão**
    (`alembic_version` em `7fd36a4d65a5`, `ALTER TYPE notificacao_tipo ADD VALUE` falha com
    `InsufficientPrivilege` pro role de migration) -- achado registrado, fora de escopo corrigir
    aqui (banco compartilhado, risco). Resolvido em Python: `app/pipeline/texto.py::normalizar_texto`
    (já existente, usado noutro contexto) comparando depois de trazer por UF, em vez de comparação
    exata em SQL -- `app/repositories/{convenios,monitoramento,cobertura_relatorio,
    propostas_candidatas_relatorio}.py`.
  - **Filtro `ano` que faltava**: `FiltroRelatorio.ano` (novo, opcional) filtra
    `Convenio.ano_instrumento`/`InstrumentoEquipamento.ano_instrumento`/
    `extract('year', PropostaCandidata.data_proposta)` -- só em `instrumentos_repasse` (cobertura
    não tem essa dimensão). Novo `app/repositories/propostas_candidatas_relatorio.py` (propostas
    candidatas -- "linhas de financiamento" -- não tinham nenhuma extração pro relatório ainda).
- **Bloco 5 — CONCLUÍDO (2026-09-26)**: enriquecimento pedido pelo usuário ("riqueza de detalhes...
  fácil de entender"), usando como referência de estilo os 2 documentos reais anexados
  (`data/relatorios/`, um Briefing e uma Nota Informativa do departamento):
  - `app/reports/formatacao.py` (novo) -- `formatar_moeda`/`formatar_data` pt-BR pro Word (texto
    puro); no Excel o valor cru é mantido (`xlsx_builder.escrever_aba_tabela` ganhou
    `colunas_moeda`/`colunas_data` **por nome**, aplicando `number_format` do Excel sem perder
    ordenação/soma).
  - `docx_builder.py` ganhou timbre institucional (`adicionar_cabecalho_institucional` -- Ministério
    da Saúde/SAES/DECAN/CGPCAN, com aviso explícito "gerado automaticamente... não substitui
    conferência humana", pra nunca se passar por Nota Informativa/Briefing já revisado por um
    analista), `adicionar_paragrafo_rotulo_valor` (padrão "**Rótulo:** valor" dos briefings reais),
    `adicionar_legenda_tabela`/`adicionar_fonte` ("Tabela N. ..."/"Fonte: ...") e
    `linhas_como_texto` (formata linha por nome de coluna antes de virar tabela de texto).
  - `services/relatorios.py` ganhou seção "Resumo executivo" (convênios/valor total/propostas
    aprovadas/instrumentos por fase) em ambos os formatos, e no Word nível "completo" narra **1
    bloco por convênio/instrumento** (objeto, convenente+CNPJ, localização, tipo de
    contratação+tipologia, programa, situação, vigência, financeiro completo -- e pro monitoramento,
    situação atual + timeline completa) em vez de só uma tabela achatada -- Excel continua tabela
    (pedido explícito: "o excel serão tabelas").
  - **Bug real achado e corrigido nesta rodada**: `analise_merito` com `escopo=cnes` ou com um
    filtro sem nenhuma família publicada gerava uma pasta Excel **sem nenhuma aba**, e o
    `openpyxl` quebra ao salvar ("At least one sheet must be visible"). `escopo=cnes` agora é
    rejeitado explicitamente (`ValidationError`, 422 -- cobertura não tem granularidade por
    estabelecimento, mesma limitação do CLAUDE.md); ausência de família publicada gera aba
    "Cobertura" com aviso em vez de quebrar.
  - **Gaps conhecidos, declarados e NUNCA fabricados** (confirmado contra o schema, não assumido):
    "Habilitação" CNES (não existe em `CnesEstabelecimento`) e "Produção assistencial" (SIH/SIA/SUS
    por procedimento, como nos briefings reais) -- essa última é dado do projeto irmão
    `nota-informativa-decan` (DuckDB/parquet), fora do banco do SIGEO. Nenhuma das duas seções
    existe até uma fonte real ser integrada (decisão explícita, não silenciosa).
- **Bloco 6 — CONCLUÍDO (2026-09-26)**: separação de UI pedida pelo usuário ("vamos separar o
  relatório de instrumentos e repasse do relatório de análise de mérito... no monitoramento de
  instrumentos devemos criar uma aba pra uma página de relatório"). `RelatorioGeradorForm` ganhou
  prop `tipoRelatorio` fixa (não é mais escolha do usuário no formulário) + campo `Ano` (só quando
  `instrumentos_repasse`) + esconde a opção CNES quando `analise_merito`. `relatorios-page.tsx`
  (fora do `MonitoramentoLayout`, onde os botões já existiam) fica só com `analise_merito`. Nova
  `monitoramento-relatorios-page.tsx` (dentro do `MonitoramentoLayout`, rota
  `/monitoramento-equipamentos/relatorios`, item de nav "Relatórios" em
  `monitoramento-nav-items.ts`) oferece só `instrumentos_repasse`. `tsc --noEmit`/`oxlint`/
  `vitest run` (113/113)/`vite build` limpos.

**Validado ao vivo contra o Neon real** (2026-09-26, leitura, sem tocar schema): relatório
`instrumentos_repasse`/completo pro filtro São Paulo/SP/2023 -- 5 convênios encontrados (a busca por
"São Paulo" achou "SÃO PAULO"/"SAO PAULO" independente de acento/caixa, confirmando a correção do
Bloco 4), 74 linhas de timeline de monitoramento, blocos narrativos completos no Word.

- **Bloco 7 — CONCLUÍDO (2026-09-26)**: pedido do usuário ("adicione uma tabela que aparece os itens
  conforme os filtros. Coloque os mesmos filtros que temos no instrumentos/repasses... separar em
  instrumentos/programas e linhas de financiamento (parceria e propostas)") -- `monitoramento-
  relatorios-page.tsx` reescrita seguindo a constituição de frontend (Plan Mode aprovado antes de
  codar):
  - **Backend**: `FiltroRelatorio` ganhou `situacao`/`programa`/`tipo_contratacao`/`busca`
    (`app/routers/relatorios.py` + `app/services/relatorios.py`), mesmos filtros de "Instrumentos e
    repasses" (Dados Oficiais). Achado ao vivo ANTES de aplicar largamente: `programa`/`situacao`
    usam vocabulário DIFERENTE em `Convenio` (SICONV) vs. `PropostaCandidata` (TransfereGov novo) --
    confirmado contra dado real (nomes de programa não batem string a string). Aplicados só onde o
    vocabulário é o mesmo de fato: `situacao`/`programa`/`tipo_contratacao`/`busca` completos em
    Convênios; só `tipo_contratacao` (vocabulário fechado idêntico) em Monitoramento; só `uf`/`ano`
    em Propostas (sem `programa`/`situacao` -- ficaria filtrando pra vazio quase sempre).
  - **Frontend**: página reaproveita 100% o dado já carregado (`useConveniosLista`/
    `usePropostasCandidatas`, zero chamada nova) pra uma prévia client-side que mostra exatamente o
    recorte que os botões geram. **Sem abas** (decisão revista ainda no mesmo bloco, pedido do
    usuário: "não quero separado em abas, quero um abaixo do outro") -- as 3 seções (Instrumentos/
    Programas, Linhas de financiamento Confirmada/parceria, Linhas de financiamento Em tramitação/
    proposta) ficam empilhadas, cada uma com sua própria tabela. 2 componentes de tabela novos
    (`relatorio-instrumentos-tabela.tsx`/`relatorio-propostas-tabela.tsx`, este último reaproveitado
    2x -- só troca `titulo`/`itens`) seguindo **o mesmo padrão de layout/formatação da tabela de
    Instrumentos Monitorados** (`monitoramento-overview-lista.tsx`, pedido explícito do usuário):
    card (`estiloCard`) + `<table>` nativa (não o `<Table>` do shadcn) + badge de tipo de contratação
    + paginação própria (`Pagination`, 20/página) + linha de "nenhum resultado" em vez de
    `EmptyState`; colunas continuam as definidas neste bloco (não as de Instrumentos Monitorados),
    numérico sempre à direita (Seção 5 da constituição). `RelatorioGeradorForm` não serve mais o
    relatório de Instrumentos e Repasse (filtros divergiram demais) -- ficou só pra Análise de
    Mérito, mais simples; lógica assíncrona de geração extraída pra `useGerarRelatorio` (Seção 7 da
    constituição), reaproveitada pelas 2 páginas; botões Nível/Excel/Word viraram
    `RelatorioBotoesGerar` (reaproveitado). Novo `useRelatorioInstrumentosFiltros` (só busca/uf/
    situacao/ano/programa/tipoContratacao -- sem `equipamento`/`classeEquipamento`/`soMonitorados`/
    `pagina`, que não fazem sentido pra recorte de relatório) ganhou depois `municipio`/`cnes`/
    `nomeEstabelecimento` (texto livre, normalizado sem acento/caixa) no mesmo bloco -- refinam as
    2 tabelas de prévia; só `municipio`/`cnes` viram parâmetro pro backend na geração (prioridade
    CNES > Município+UF > UF > Brasil, mesma hierarquia mutuamente exclusiva do backend);
    `nomeEstabelecimento` não tem campo próprio ali, é só um jeito de achar o CNES certo na prévia.
    Ajuste de UI no mesmo bloco (pedido do usuário): as 3 seções ficam **empilhadas, sem abas**
    (revisão do desenho original) e as 2 tabelas de prévia seguem o mesmo padrão de layout da tabela
    de Instrumentos Monitorados (`monitoramento-overview-lista.tsx`) -- card + `<table>` nativa +
    badge + paginação própria, em vez do `<Table>` do shadcn com scroll. Revisão final ainda no
    mesmo bloco (pedido do usuário): `município`/`cnes`/`nomeEstabelecimento` viraram **lista
    suspensa** (`SingleSelectFilter`, mesmo modelo de UF/situação/programa/tipo, não mais texto
    livre) -- opções derivadas do próprio `conveniosBase` já filtrado pelos demais campos
    (`opcoesUnicas`, novo helper local, não entra na cascata de `useDadosOficiaisOpcoes`); campo
    `busca` (texto livre) **removido** da página a pedido do usuário (semântica redundante com os
    seletores fechados); label "Filtrar por" também removido só nesta página -- `FilterWorkspace`
    ganhou prop opcional `semRotulo` (default `false`, não afeta os demais consumidores). Achado
    ao vivo (conferido contra o banco real antes de fechar): CNES presente em 100% dos instrumentos
    monitorados e 92% dos convênios, mas só 36% das propostas candidatas (a maioria em tramitação
    ainda não tem estabelecimento identificado na fonte) -- filtro de CNES/Estabelecimento nas
    Propostas vai naturalmente excluir boa parte delas, não é bug. `tsc --noEmit`/`oxlint`/
    `vitest run` (113/113)/`vite build` limpos; suíte backend 322 testes (inalterada).

**Status**: Blocos 1-7 concluídos. Plan Mode fechado.
