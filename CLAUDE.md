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

## Limitações conhecidas

- **Sem monitoramento por equipamento individual**: CNES/ElastiCNES só
  fornece quantidade agregada por estabelecimento, sem id de equipamento
  específico. Uma extensão de "monitoramento" (rastrear o mesmo equipamento
  ao longo do tempo) fica fora de escopo até aparecer uma fonte com essa
  granularidade — não tentar simular isso com o schema atual.
- Os 3 placeholders de produtividade restantes (Acelerador Linear, Ultrassom,
  Mamógrafo) não são parâmetro oficial — não usar esses números como
  referência normativa em nenhuma análise. PET-CT saiu da lista em
  2026-08-28 (produtividade real da Portaria de Consolidação n. 1/2017,
  art. 102-106 — ver `docs/metodologia-parametros.md`).

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
