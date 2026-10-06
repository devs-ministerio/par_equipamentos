# SIGEO — Sistema de Gestão de Equipamentos em Oncologia

Ferramenta do DECAN/MS (Departamento de Controle do Câncer) para gestão de
equipamento oncológico de ponta a ponta: da decisão de investimento
(déficit/superávit por município, região de saúde ou macrorregião) ao
acompanhamento do que acontece depois que o recurso é transferido — entrega,
instalação, licenciamento CNEN, inauguração — algo que nenhum sistema federal
(TransfereGov, Portal da Transparência, SICONV, CNES) rastreia sozinho.
Substitui planilha manual por dado consultável, com sessão autenticada e
controle de acesso, para técnicos, gestores e outros interessados em
propostas de investimento oncológico.

Contexto de produto e histórico de decisões: [`docs/design/decan-equipamentos-contexto.md`](docs/design/decan-equipamentos-contexto.md).
Regras de cálculo e parâmetros normativos realmente implementados (fonte da
verdade, espelha o código com arquivo/linha): [`docs/metodologia-parametros.md`](docs/metodologia-parametros.md).
Decisões de arquitetura, convenções e histórico de cada Plan Mode executado:
[`CLAUDE.md`](CLAUDE.md).

## Módulos

- **Análise de mérito** (`/dashboard`, `/mapa`, `/relatorios`) — o núcleo
  original: cobertura assistencial de tomógrafo, ressonância magnética,
  PET-CT, acelerador linear, ultrassom e mamógrafo por município/região de
  saúde/macrorregião, com mapa, indicadores e exportação (PDF/XLSX). Usa só
  oferta SUS e em uso (nunca o total informativo) — ver
  [`docs/metodologia-parametros.md`](docs/metodologia-parametros.md).
- **Monitoramento de equipamento** (`/monitoramento-equipamentos/*`) —
  acompanhamento manual pós-repasse (91 instrumentos hoje): fase geral,
  cronograma físico, licenciamento CNEN e inauguração de cada convênio/FAF/
  TED/PERSUS monitorado, com histórico append-only auditável (evento nunca é
  editado in-place, só substituído com rastro).
- **Radar de Convênios / Linhas de financiamento** — descoberta automática de
  propostas novas no TransfereGov, casamento com o catálogo de equipamentos
  do SIGEO, e triagem manual antes de entrar no monitoramento interno.
- **Notificações** — alerta por destinatário (técnico titular/suplente do
  instrumento) de atualização de proposta, edição manual e vencimento de
  licença/vigência, sem depender de e-mail externo.
- **Gestão de usuários** (`/admin/usuarios`) — RBAC com 4 papéis
  (`admin`/`gestor`/`colaborador`/`leitor`; os 3 primeiros têm os mesmos
  poderes de edição hoje, só `leitor` é restrito a consulta), convite por
  e-mail com token de uso único, bloqueio de conta após tentativas
  inválidas e trilha de auditoria (`AuditLog`).

Todo o app fica atrás de login (sessão por cookie `HttpOnly` + CSRF
double-submit + rate limit) — não há mais rota pública além de `/health` e do
catálogo fixo de marcos do monitoramento.

## Stack

- **Backend** (`backend/`): FastAPI + SQLAlchemy 2 + Alembic + Polars, Python
  3.12, gerenciado com [uv](https://docs.astral.sh/uv/). Postgres (Neon em
  produção). Autenticação por JWT + refresh cookie rotativo (hash de senha
  `argon2id`), autorização em camada de Service (`DomainError`, não
  `HTTPException` direto), Repository/Service para os módulos migrados.
  Geração de relatório (Excel/Word) também é feita aqui, com `openpyxl`/
  `python-docx` — ver `app/services/relatorios.py`.
- **Frontend** (`frontend/`): React 19 + TypeScript + Vite, Tailwind CSS v4 +
  shadcn/ui, TanStack Query + Zod (validação de contrato HTTP) + React Hook
  Form, react-router-dom, Leaflet + D3 (mapas). Export de relatório não roda
  mais no client (`exceljs`/`jspdf` removidos no Plan Mode relatórios
  2026-09-25/26) — o frontend só consome o arquivo pronto do backend.
- Sem monorepo tool — backend e frontend são projetos independentes, cada um
  com seu próprio dependency manager e deploy.

## Rodando local

### Backend

```bash
cd backend
uv sync
cp .env.example .env   # preencher DATABASE_URL com um Postgres local
uv run alembic upgrade head
uv run python -m scripts.seed_monitoramento   # dataset sintético opcional (sem PII)
uv run python -m tests.fixtures_cobertura     # idem, cobertura/oferta de equipamento
uv run uvicorn app.main:app --reload
```

`JWT_SECRET` é obrigatório e precisa ter pelo menos 32 caracteres — o boot
falha (não só a primeira chamada de login) se estiver vazio/curto. Sessão usa
cookie `HttpOnly`; como dev local roda em `http://` (não `https://`),
descomente `COOKIE_SECURE=false` no `.env` (o default `SameSite=Lax` já serve
local) — sem isso o cookie não vai/volta em http puro e o login "falha
silenciosamente" (200 no `/auth/login`, mas `/auth/me` sempre 401). Ver
comentário em `.env.example`.
Primeiro usuário: `uv run python scripts/criar_usuario.py --name "Nome"
--email nome@org.gov.br --role admin` (ver `backend/README.md`).

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
cd backend && TEST_DATABASE_URL=postgresql+psycopg://... uv run pytest -m db
cd backend && TEST_DATABASE_URL=postgresql+psycopg://... uv run python -m scripts.auditar_integridade_database

# frontend
cd frontend && npm run test    # vitest run
cd frontend && npm run lint    # oxlint
```

## Estrutura

```
backend/
  app/
    routers/        # auth, usuarios, convenios, equipment_offer, macro_coverage,
                     # municipality_coverage, monitoramento, notificacoes, propostas_candidatas
    services/        # regra de negócio + autorização (padrão Repository/Service)
    repositories/    # acesso a dado, sem regra de negócio
    pipeline/        # importação/cálculo de cobertura por família de equipamento
    db/models.py     # schema único (análise de mérito + monitoramento + notificações + usuários)
  scripts/           # pipelines (run_pipeline_*.py), importadores, jobs de descoberta/verificação
  alembic/           # migrations
  tests/
frontend/
  src/
    pages/           # só composição de rota (Dashboard, Mapa, Relatorios, Monitoramento*, Usuarios...)
    components/features/  # componentes de domínio (flat, kebab-case)
    components/{ui,layout,common}/  # compartilhado
    services/        # 1 cliente HTTP central (lib/http-client.ts) + Zod por domínio
    hooks/           # TanStack Query por domínio
data/raw/            # fontes de dado brutas (CNES/ElastiCNES, IBGE, INCA, ANS...)
docs/
  metodologia-parametros.md              # regras de cálculo — fonte da verdade
  design/decan-equipamentos-contexto.md  # histórico de produto/decisões (protótipo)
  arquitetura/                           # diagnósticos, plan-modes, runbooks, contratos HTTP
  prototipo/decan-prototipo_1.html       # protótipo HTML standalone, anterior à app real
  referencias/                           # documentos/imagens de referência normativa
```

## Deploy

- **Backend**: Render (`render.yaml`), free tier, Postgres externo no Neon
  (referenciado só por `DATABASE_URL`, credencial `sigeo_runtime` — só DML).
  `alembic upgrade head` **não roda no boot** — `sigeo_runtime` nem teria
  privilégio de DDL pra isso. Migration é um passo manual/isolado, com a
  credencial `sigeo_migration` (dona do schema), via
  `.github/workflows/migrar_banco.yml` (`workflow_dispatch`) ou local —
  sempre antes de qualquer deploy que dependa de schema novo, nunca depois
  (ver `backend/README.md`, seção "Banco de dados local e roles do Neon").
  Migrar para Railway depois não muda código nenhum (tudo lido de env var,
  ver `backend/app/config.py`); só recriar o serviço lá com as mesmas envs,
  usando `backend/Procfile`.
- **Frontend**: Vercel (`frontend/vercel.json`, rewrite de SPA).
- **Pipelines de dado** (Tomógrafo, Ressonância, PET-CT):
  `.github/workflows/pipelines.yml`,
  hoje só `workflow_dispatch` (manual) — o cron diário fica comentado até
  existir deploy com `DATABASE_URL` pública alcançável pelo runner.
- **CI**: `backend_ci.yml`/`frontend_ci.yml` (lint/tipo/teste/build a cada
  PR), `e2e_ci.yml` (E2E autenticado, Postgres efêmero), `secret_scan.yml`/
  `static_security.yml`/`supply_chain.yml` (SAST/SBOM/CVE).
- **Operação DevOps**: workflow de migration e jobs usam o environment GitHub
  `production`; o procedimento de deploy, rollback, containerização local e
  recuperação está em
  [`docs/arquitetura/runbook-devops.md`](docs/arquitetura/runbook-devops.md).

## Estado atual (o que é real vs. placeholder)

**Tomógrafo**, **Ressonância Magnética** e **PET-CT** têm pipeline de dado
real e parâmetro confirmado na Análise de mérito. Acelerador Linear,
Ultrassom e Mamógrafo ainda usam produtividade placeholder (mesmo número do
Tomógrafo, só para não quebrar o código) e não têm pipeline — ver a tabela em
[`docs/metodologia-parametros.md`](docs/metodologia-parametros.md) para o
detalhe atualizado. Essa limitação é exclusiva da Análise de mérito — o
Monitoramento de equipamento não depende de pipeline algum, é cadastro
manual da equipe.
