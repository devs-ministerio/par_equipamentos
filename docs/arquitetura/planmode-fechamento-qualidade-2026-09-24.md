# Plan-mode — Fechamento da Constituição de Qualidade (2026-09-24)

## Objetivo e conclusão

Executar 100% das pendências do [diagnóstico de qualidade de 2026-09-24](diagnostico-constituicao-qualidade-2026-09-24.md) e tornar a Constituição de Testes & Qualidade uma política mensurável e bloqueante.

O plano só estará concluído quando a cobertura for medida e bloqueada por camada, os cenários centrais SUS/em uso não dependerem de `skip`, os contratos HTTP tiverem matriz auditável, E2E crítico rodar no CI e todos os gates terminarem sem warnings. Não reduzir thresholds para acomodar a base atual.

## Regras transversais

- Testes usam somente fixtures sintéticas e PostgreSQL de teste; nunca Neon, produção ou dados reais.
- Mockar somente I/O externo. Regra de domínio, repository e schema real são exercitados na camada correspondente.
- Correção de bug recebe teste de regressão no mesmo bloco.
- Não criar `skip`, `only`, `xfail` ou baseline genérica para tornar o gate verde. Exceção exige decisão, prazo e issue.
- Remover artefatos temporários, comentários mortos e contexto desatualizado encontrados. Migrations históricas e adaptadores TransfereGov/SICONV documentados não são código morto.
- Ao final de cada bloco, executar os gates afetados e atualizar o diagnóstico/plano com a evidência.

## Linha de base

- Backend: 197 coletados, 189 aprovados, 8 pulados; cobertura exploratória de 77%, sem threshold no CI.
- Frontend: 21 suítes, 81 testes aprovados; não há provider de coverage versionado.
- CI backend/frontend está verde; E2E existente (rota anônima, login e responsividade) não roda em CI.
- Há 42 operações HTTP. Oferta de equipamentos, cobertura municipal e macro têm menor cobertura e são prioridade.

## Ordem obrigatória

```text
0. Corrigir régua e contexto
1. Cobertura backend e fixture de integração
2. Cobertura frontend e testes comportamentais
3. Matriz e testes de contrato HTTP
4. E2E autenticado como gate de CI
5. Higiene estática, governança e fechamento
```

## 0. Régua operacional e contexto

### Implementação

1. Atualizar `padroes/qualidade/constituicao_qualidade.md` para `npm`/`package-lock.json` e Oxlint, substituindo pnpm/ESLint.
2. Definir paths de cobertura: services `backend/app/services/**`; repositories `backend/app/repositories/**`; routes `backend/app/routers/**`; hooks/componentes lógicos em `frontend/src/hooks/**` e componentes com estado/ação. Componentes puramente apresentacionais ficam fora do piso específico e recebem smoke E2E.
3. Formalizar contrato mínimo por operação pública: sucesso e erros aplicáveis de autenticação, validação e domínio.
4. Criar template versionado de PR com plano, camadas, edge cases, fixtures/mocks, impacto de CI, riscos e revisão de código/comentário morto.

### Aceite

- Constituição reproduz exatamente ferramentas e comandos do repositório.
- Thresholds e evidência de revisão deixam de ser ambíguos.

### Andamento

**Concluído em 2026-09-24.** Constituição atualizada para npm/Oxlint,
mapeamento por camada e contrato mínimo; template de PR versionado em
`.github/PULL_REQUEST_TEMPLATE.md`.

## 1. Cobertura backend e fixture de integração

### Implementação

1. Adicionar `pytest-cov` travado às dependências de desenvolvimento e configurar branch coverage no `pyproject.toml`.
2. Gerar relatórios terminal/XML ou JSON como artifact de CI, sem versionar outputs.
3. Criar fixture única, sintética, pequena e idempotente para `Execution`, `EquipmentOfferRow`, `MunicipalityCoverage`, CNES e agregados necessários.
4. Substituir os skips de `test_equipment_totals.py`, `test_municipality_coverage.py` e FK dependente de dados por cenários determinísticos. Skip residual só pode ser inerentemente ambiental e documentado.
5. Completar testes de service/repository/route nos módulos abaixo do piso: `equipment_offer`, `municipality_coverage`, `macro_coverage`, marcadores e importadores externos. I/O externo usa payload sintético, timeout e 5xx.
6. Aplicar thresholds por camada: services 80%, repositories 70%, routes 60%. Percentual global não substitui esses gates.

### Casos obrigatórios

- `sus_flag` + equipamento em uso, nunca quantidade existente; execução mais recente por família.
- Vazio, filtro inválido, paginação/limite, inexistente, 401/403 aplicáveis, payload externo malformado, timeout e 5xx.
- Idempotência da fixture/seed e isolamento de teste.

### Aceite

- `uv run ruff check .`, `uv run mypy .` e `uv run pytest` verdes, sem os oito skips dos domínios centrais.
- `pytest --cov --cov-branch` bloqueia abaixo dos pisos e o workflow backend publica o relatório.

### Andamento parcial — 2026-09-24

- `pytest-cov` e branch coverage foram adicionados e travados.
- Fixture sintética determinística de TOMOGRAFO elimina os oito skips de
  cenário central; a suíte passou com **197/197**.
- Nova baseline exploratória: **80%** total. Ainda faltam testes dos módulos
  abaixo do piso, o verificador por camada e a publicação do relatório no CI.
- Contratos de `equipment_offer` foram ampliados para autenticação, validação,
  filtros, agregação SUS/em uso e raio; a cobertura isolada da rota chegou a
  **80%** (piso constitucional: 60%).
- Serviço e repository de marcadores relacionais atingiram, respectivamente,
  **88%** e **79%**, cobrindo item não prioritário, idempotência, deduplicação
  visual e preservação da evidência auditável.
- Serviço de usuários atingiu **86%**, incluindo convite, token, auditoria,
  reenvio, normalização de e-mail e erros de domínio.
- Serviço de evidências relacionais do TransfereGov atingiu **100%**, cobrindo
  payload inválido, persistência, idempotência e atualização incremental sem
  remover o adaptador JSON compatível.
- Rota de convênios atingiu **90%**, com contratos de autenticação, filtro,
  paginação, 404 e regra das cargas manuais (desembolso integral, sem payload
  oficial simulado no detalhe).
- O verificador versionado de cobertura por camada foi validado contra a
  suíte completa: services **93,4%/82,5%**, repositories **94,7%/77,6%** e
  routes **90,1%/63,0%** (linhas/branches), todos acima dos pisos. O workflow
  backend agora bloqueia regressão e publica JSON/XML por 14 dias.

## 2. Cobertura frontend e testes comportamentais

### Implementação

1. Adicionar/travar `@vitest/coverage-v8`, configurar cobertura e excluir somente bootstrap, tipos, mocks e componentes comprovadamente apresentacionais com justificativa explícita.
2. Publicar relatório e bloquear hooks/componentes lógicos abaixo de 70%.
3. Completar services: resposta válida, Zod inválido, HTTP, rede, CSRF/refresh e normalização em `ApiError`.
4. Completar hooks: loading, sucesso, erro, invalidação e mutation; componentes: formulário, vazio, erro, clique e acessibilidade observável.
5. Priorizar consumidores de oferta/cobertura e monitoramento; não duplicar fluxo já coberto na unidade.

### Aceite

- `npm run lint`, `npm run typecheck`, `npm run test -- --coverage` e `npm run build` verdes.
- Hooks/componentes lógicos >=70%, com relatório no CI.

## 3. Matriz e testes de contrato HTTP

### Implementação

1. Criar `docs/arquitetura/contratos-http-sigeo.md` com as 42 operações: rota, consumidor, sucesso, erros, autenticação e arquivo de teste.
2. Preencher primeiro oferta de equipamentos, cobertura municipal e macro.
3. Usar TestClient/ASGI e schemas reais para status, serialização, headers aplicáveis e ausência de eco sensível em erro.
4. Referenciar o teste na matriz. Endpoint só fica completo com evidência executável.

### Aceite

- Toda operação tem teste de sucesso; rotas protegidas cobrem 401/403, entradas validadas cobrem 422 e erros de domínio têm status/corpo testados quando aplicáveis.

## 4. E2E autenticado como gate de CI

### Implementação

1. Separar smoke anônimo da suíte autenticada para que ausência de credenciais não crie browser antes do skip.
2. Definir preview isolado ou stack efêmero com backend, frontend e banco sintético; testes destrutivos nunca apontam para produção.
3. Criar conta E2E descartável, de menor privilégio, e usar `E2E_EMAIL`/`E2E_SENHA` somente como secrets GitHub — nunca em `.env`, spec, log ou artifact.
4. Provisionar Chromium no workflow, rodar Playwright serialmente e reter trace/screenshot apenas em falha.
5. Cobrir redirecionamento sem sessão, login, leitura de monitoramento, consulta/filtro crítico e ausência de overflow nas rotas definidas.

### Aceite

- E2E verde em PR/push relevante e falha bloqueia o gate.
- Secrets não aparecem em log, trace, screenshot ou código.

## 5. Higiene estática, governança e fechamento

### Implementação

1. Eliminar os dois warnings Starlette/HTTPX preservando o comportamento testado.
2. Habilitar `check_untyped_defs` progressivamente; resolver achados sem `Any` nem `type: ignore` amplo e avaliar strict por módulo, sem nova baseline.
3. Adicionar formatter verificável a backend/frontend, com comando de check separado. Não reformatar migrations aplicadas só por estilo.
4. Adicionar complexidade e duplicação como alerta não bloqueante no CI; planejar extração de unidades grandes sem refatoração cosmética junto de feature.
5. Registrar política de flakiness: dono, prazo, issue para quarentena e proibição de skip silencioso.
6. Atualizar diagnóstico, README/AGENTS/comandos afetados e limpar arquivos sem consumidor.

### Aceite

- Todos os gates terminam sem warnings.
- Formatter, lint, tipos, cobertura, testes, build, contratos e E2E possuem comandos e workflow verificáveis.
- Diagnóstico final apresenta nota, evidências e apenas dívidas explicitamente aceitas; sem pendência executável significa 100% deste plano.

## Validação final

```bash
cd backend
uv run ruff check .
uv run mypy .
uv run pytest --cov --cov-branch

cd ../frontend
npm run lint
npm run typecheck
npm run test -- --coverage
npm run build
npm run test:e2e
```

No GitHub Actions, os equivalentes rodam em jobs separados, com PostgreSQL efêmero para backend/contratos e ambiente isolado para E2E. A checagem final exige artifacts de coverage, migrations, ausência de skips dos dados centrais e todos os status checks aprovados.

## Fora de escopo deliberado

- Buscar 100% de cobertura global ou testar detalhe visual puramente apresentacional.
- Reformatar em massa migrations aplicadas ou remover compatibilidades documentadas.
- Teste de carga, acessibilidade automatizada abrangente e mutation testing: melhorias futuras, não substitutos dos critérios deste plano.
