# Contexto do projeto — SIEO (par_equipamentos)

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
`frontend/src/pages/Monitoramento{Overview,Instrumento,Painel}Page.tsx` +
`frontend/src/pages/monitoramento/MonitoramentoInterno.tsx`. Overview
operacional (KPIs, fase média, licenças CNEN, inaugurações, filtros por
fase/técnico/UF/tipo de contratação) em
`/monitoramento-equipamentos/instrumentos`; detalhe por convênio em
`/monitoramento-equipamentos/instrumentos/{nr_convenio}`; painel
executivo (só dashboards — funil, pizza, barras, mapa fica pra depois,
ver limitação — pra avaliação da gestão) em
`/monitoramento-equipamentos/painel`. Desde 2026-09-10 as 4 páginas
vivem dentro de `MonitoramentoLayout` (`frontend/src/components/layout/`),
com nav própria (`MonitoramentoTopNav.tsx`) incluindo o link de volta
pra análise de mérito (`/dashboard`) — não são mais standalone fora de
qualquer layout.

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
