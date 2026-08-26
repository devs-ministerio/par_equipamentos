# SIEO — Sistema de Informação de Equipamentos Oncológicos

Ferramenta do DECAN/MS (Departamento de Controle do Câncer) para saber se um
município, região de saúde ou macrorregião de saúde está em déficit ou
superávit de equipamento oncológico (tomógrafo, ressonância magnética,
PET-CT, acelerador linear, ultrassom, mamógrafo). Substitui uma planilha
manual por mapa, indicadores e um catálogo de déficit consultável por
técnicos, parlamentares e outros interessados em propostas de investimento.

Contexto de produto e histórico de decisões: [`docs/design/decan-equipamentos-contexto.md`](docs/design/decan-equipamentos-contexto.md).
Regras de cálculo e parâmetros normativos realmente implementados (fonte da
verdade, espelha o código com arquivo/linha): [`docs/metodologia-parametros.md`](docs/metodologia-parametros.md).

## Stack

- **Backend** (`backend/`): FastAPI + SQLAlchemy 2 + Alembic + Polars, Python
  3.12, gerenciado com [uv](https://docs.astral.sh/uv/). Postgres.
- **Frontend** (`frontend/`): React 19 + TypeScript + Vite, react-router-dom,
  Leaflet + D3 (mapas), exceljs/jspdf (export de relatório).
- Sem monorepo tool — backend e frontend são projetos independentes, cada um
  com seu próprio dependency manager e deploy.

## Rodando local

### Backend

```bash
cd backend
uv sync
cp .env.example .env   # preencher DATABASE_URL com um Postgres local
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API sobe em `http://localhost:8000`. `/health` confirma que o processo
subiu **e** que a conexão com o banco funciona.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Sobe em `http://localhost:5173` (origem já liberada por padrão em
`CORS_ORIGINS` no backend).

### Testes e lint

```bash
# backend
cd backend && uv run pytest

# frontend
cd frontend && npm run test    # vitest run
cd frontend && npm run lint    # oxlint
```

## Estrutura

```
backend/
  app/
    routers/       # macro-coverage, municipality-coverage (+ health-region), equipment-offer-rows
    pipeline/       # importação/cálculo de cobertura por família de equipamento
    db/models.py    # schema único (Competency/Execution por família, Coverage, EquipmentOfferRow, ConfigDecision...)
  scripts/          # pipelines executáveis (run_pipeline_tomografo.py, run_pipeline_ressonancia.py, importadores)
  alembic/          # migrations
  tests/
frontend/
  src/
    pages/          # PainelGeral, Dashboard, Mapa, Relatorios
    components/     # dashboard, mapa, layout, modals
    utils/          # coeficiente, geo (distância), status, export (pdf/xlsx)
data/raw/           # fontes de dado brutas (CNES/ElastiCNES, IBGE, INCA, ANS...)
docs/
  metodologia-parametros.md          # regras de cálculo — fonte da verdade
  design/decan-equipamentos-contexto.md  # histórico de produto/decisões (protótipo)
  prototipo/decan-prototipo_1.html   # protótipo HTML standalone, anterior à app real
  referencias/                       # documentos/imagens de referência normativa
```

## Deploy

- **Backend**: Render (`render.yaml`), free tier, Postgres externo no Neon
  (referenciado só por `DATABASE_URL`). Migration roda dentro do próprio
  `startCommand` porque `preDeployCommand` não existe no free tier — é
  idempotente (`alembic upgrade head`), então rodar em todo boot é seguro.
  Migrar para Railway depois não muda código nenhum (tudo lido de env var,
  ver `backend/app/config.py`); só recriar o serviço lá com as mesmas envs,
  usando `backend/Procfile`.
- **Frontend**: Vercel (`frontend/vercel.json`, rewrite de SPA).
- **Pipelines de dado** (Tomógrafo, Ressonância): `.github/workflows/pipelines.yml`,
  hoje só `workflow_dispatch` (manual) — o cron diário fica comentado até
  existir deploy com `DATABASE_URL` pública alcançável pelo runner.

## Estado atual (o que é real vs. placeholder)

Só **Tomógrafo** e **Ressonância Magnética** têm pipeline de dado real e
parâmetro confirmado, em produção. PET-CT, Acelerador Linear, Ultrassom e
Mamógrafo ainda usam produtividade placeholder (mesmo número do Tomógrafo,
só para não quebrar o código) e não têm pipeline — ver a tabela em
[`docs/metodologia-parametros.md`](docs/metodologia-parametros.md) para o
detalhe atualizado.
