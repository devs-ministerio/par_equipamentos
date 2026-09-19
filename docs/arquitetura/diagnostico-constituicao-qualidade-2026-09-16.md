# Diagnóstico da Constituição de Testes & Qualidade — 2026-09-16

## Escopo e método

Este diagnóstico confronta `padroes/qualidade/constituicao_qualidade.md` com
o estado atual do backend, frontend, database e automações do SIGEO. Foram
avaliados pirâmide de testes, execução real, banco de teste, contratos HTTP,
edge cases, mocks, fixtures, cobertura, lint, tipos, build, complexidade,
regressão, flakiness, revisão e Definition of Done.

Foram executados os gates existentes. O banco local dedicado
`par_equipamentos_pytest_loaded` foi atualizado de `a7c4e1f9b203` até
`c9f1a4d7e602` antes da segunda execução, para separar falha de ambiente de
falha funcional. Nenhum código produtivo foi alterado.

Processos que dependem de GitHub, proteção de branch ou prática da equipe são
classificados como **não comprovados** quando não há configuração ou artefato
versionado.

## Resumo executivo

O backend possui uma base de testes útil: 90 testes coletados, regressões de
bugs reais, testes PostgreSQL protegidos contra uso acidental do banco
principal e verificações de schema, constraints e transações. Os 30 testes do
frontend também são rápidos e cobrem funções puras importantes.

A constituição, entretanto, ainda não opera como política de qualidade. Não
há CI, cobertura medida, thresholds, Ruff, mypy, formatter validado, testes de
hooks/componentes/services frontend, E2E, nem contrato HTTP sistemático por
endpoint. O frontend não passa typecheck/build e o lint acumula warnings.

Após aplicar as migrations no banco de teste, a suíte backend terminou com
**89 aprovados e 1 falhando**. A falha revela uma divergência de domínio:
`GET /equipment-offer-rows/totals` devolve `available_qty=4381`, enquanto a
soma de `GET /macro-coverage` devolve `4471` para Tomógrafo. A invariância
esperada pela própria regressão está quebrada.

Avaliação inicial: **3,8/10 de conformidade com a Constituição de Qualidade**.
A nota reconhece a boa base backend e testes puros relevantes, mas a ausência
de gates mensuráveis e a suíte principal vermelha impedem considerar qualquer
mudança pronta segundo a Definition of Done da própria constituição.

## Evidências objetivas

- Backend: 22 arquivos de teste, aproximadamente 1.801 linhas e 90 testes.
- Backend sem `TEST_DATABASE_URL`: 43 aprovados, 47 pulados, 1 warning.
- Backend com PostgreSQL local atualizado: 89 aprovados, 1 falhando, 1 warning.
- Frontend: 7 arquivos, 222 linhas e 30 testes de funções puras.
- Frontend: 30/30 testes aprovados em 185 ms.
- Frontend: zero testes de hook, componente React, service/API ou fluxo E2E.
- Backend: cerca de 29 rotas públicas; somente dois módulos usam `TestClient`
  de forma relevante. Grande parte dos testes chama funções de router direto.
- Frontend: 27 arquivos de hooks e 3 services sem suíte própria.
- `npm run lint`: 15 warnings; a constituição exige zero warning.
- `npm run typecheck`: falha por arquivos duplicados apenas pelo casing
  (`Pagination/pagination` e `Modal/modal`).
- `npm run build`: não executa porque o typecheck anterior falha.
- Ruff, mypy e coverage/pytest-cov não estão instalados no backend.
- Não existe configuração de coverage ou threshold no frontend.
- Não existe workflow de CI de aplicação.
- Não existe Playwright, Cypress, jsdom ou Testing Library configurado.

## Pontos conformes ou bem encaminhados

### Backend e database

- Há testes de regras centrais de cobertura, geografia, radiofármaco,
  competência por família, deduplicação e execução de pipeline.
- Diversos testes registram explicitamente o bug que protegem, formando uma
  base real de regressão em vez de testes decorativos.
- O `conftest.py` exige PostgreSQL e nome contendo `test`/`pytest` antes de
  permitir testes destrutivos. Essa proteção é adequada.
- Testes DB validam constraints, FKs, schema, ponteiro Alembic, transação,
  consultas e projeções.
- A suíte usa dados sintéticos/seed controlado; não foi encontrado uso direto
  de credenciais ou dump de produção dentro dos testes.
- Não foram encontrados `assert True`, `expect(true)`, `toBeTruthy`, `xfail`
  ou testes `.only`.
- Não há skips permanentes no frontend. Os skips backend encontrados são
  condicionais ao banco/dado necessário e têm motivo explícito.

### Frontend

- Os testes existentes são rápidos, determinísticos e focados em funções
  puras de coeficiente, geografia, formatação, texto, tags e constantes.
- Há casos de nulo, borda, normalização e valores exatos em parte relevante
  dessa suíte.
- Vitest está integrado ao Vite e possui comandos separados para execução
  única e watch.

## Divergências prioritárias

### P0 — a linha de base não está verde

1. **Falha funcional backend.** A soma SUS/em uso de `equipment_offer_row`
   difere em 90 unidades do valor gravado em `macro_coverage`. É necessário
   determinar se o agregado está obsoleto, se execuções diferentes foram
   combinadas ou se pipeline e endpoint aplicam filtros distintos. O teste
   deve permanecer como bloqueio até a invariância ser restabelecida.

2. **Typecheck e build frontend falham.** O filesystem contém versões com
   casing incompatível de Modal e Pagination. A Definition of Done não pode
   ser atendida no estado atual.

3. **Lint com warnings.** Há expressões não utilizadas e exports que quebram
   Fast Refresh. A constituição define tolerância zero.

4. **Sem CI bloqueante.** Nenhum dos problemas acima impediria merge ou
   deploy automaticamente. Os workflows atuais são jobs operacionais de
   dados, não gates de qualidade.

### P0 — cobertura obrigatória não é medida

1. Não há `pytest-cov`/coverage no backend nem provider de coverage Vitest.
2. Não existem thresholds por camada de 80/70/60/70%.
3. Não existe relatório de branches; portanto não é possível provar os
   mínimos constitucionais, mesmo quando os testes passam.
4. Cobertura não é publicada como artifact, comentário de PR ou status check.
5. A nota de conformidade não presume cobertura a partir da quantidade de
   testes; ela permanece **desconhecida** até ser medida.

### P1 — pirâmide incompleta

1. **Frontend sem camada comportamental.** Os 30 testes exercitam apenas
   lógica pura. Nenhum dos 27 hooks comprova loading, erro, sucesso,
   invalidação ou ação, como exige a constituição.
2. Nenhum componente testa estados visíveis, interação, formulário,
   acessibilidade ou mensagem de erro.
3. Services e schemas Zod não possuem testes de payload válido, payload
   malformado, erro HTTP, rede ou normalização para `ApiError`.
4. Não há E2E de fluxos críticos: autenticação, consulta de cobertura,
   filtros do dashboard, monitoramento de instrumento ou revisão de proposta.
5. Backend concentra testes em routers e banco. A nova camada de services e
   repositories possui cobertura parcial e ainda não forma uma pirâmide
   consistente por domínio.

### P1 — contrato HTTP insuficiente

1. Há aproximadamente 29 operações de rota, mas testes via `TestClient`
   concentram-se em cobertura municipal e totais de equipamentos.
2. `test_monitoramento.py`, `test_notificacoes.py` e parte dos testes de
   propostas chamam funções Python diretamente. Isso valida regra e query,
   mas não comprova status code, serialização, autenticação, headers e schema
   efetivamente exposto pelo FastAPI.
3. Não há uma matriz endpoint × sucesso × erro × autorização.
4. O frontend valida parte das respostas com Zod, porém não há teste de
   compatibilidade consumidor/produtor ou schema OpenAPI.
5. Erros 401, 403, 404, 409 e 422 não são exercitados sistematicamente em
   nível HTTP.

### P1 — testes DB dependem de estado carregado

1. Sem variável de banco, 47 de 90 testes são pulados. Uma execução local
   aparentemente verde cobre menos da metade da suíte.
2. Alguns módulos pulam quando o banco não possui execução/linhas específicas.
   Isso permite CI verde com fixture incompleta.
3. O `pytest_sessionstart` faz seed de monitoramento, mas pipelines de
   cobertura dependem de estado previamente carregado no banco
   `pytest_loaded`; não há fixture única que reconstrua todo o cenário.
4. Os testes de integração não usam transação com rollback uniforme. Parte
   deles realiza commits e depende de limpeza manual própria.
5. O teste de migration valida `head` e metadata, mas não há evidência de
   ciclo completo `upgrade` limpo + `downgrade` limpo para cada migration.

### P1 — qualidade estática incompleta

1. Backend não possui Ruff, mypy ou formatter em dependências/configuração.
2. Frontend usa Oxlint, mas não existe modo que converta warnings em falha.
3. Não há Prettier ou verificação equivalente de formatação frontend.
4. Não há Black/Ruff format para Python.
5. Não existe análise de complexidade ou duplicação (`jscpd`/equivalente).
6. Há unidades muito acima dos limites constitucionais: router de
   monitoramento com 840 linhas; componente de propostas com 868; services
   frontend com 505 e 454; hook de filtros com 348.

### P1 — processo de qualidade não comprovado

1. Não há template de PR registrando plano, edge cases, trade-offs e impacto
   em CI.
2. Não há CODEOWNERS ou checklist automatizado de revisão.
3. Não há branch protection/status checks versionados ou comprovados.
4. Não existe catálogo de testes flaky, tempo histórico da suíte ou política
   operacional para incidentes de flakiness.
5. Não há mecanismo que exija teste de regressão ao corrigir bug; a prática
   aparece em bons testes existentes, mas depende de revisão humana.

### P2 — aderência do padrão de escrita

1. Os nomes backend são majoritariamente descritivos e em linguagem de
   domínio, mas poucos testes usam separação AAA visível ou Given-When-Then,
   exigida literalmente pela constituição.
2. Há fixtures/helpers locais úteis, porém não existe camada consistente de
   factories/builders por domínio. Muitos testes montam modelos diretamente.
3. Alguns asserts verificam apenas relações (`<=`) ou presença. Eles são
   válidos como invariantes, mas precisam coexistir com valores exatos nos
   cenários em que o resultado é determinístico.
4. O warning de depreciação de `TestClient`/HTTPX permanece na suíte e viola
   a expectativa de execução sem warning acumulado.

## Inconsistências na própria constituição

Estas correções devem ser feitas antes de transformar o texto em gate literal:

1. A validação obrigatória usa `pnpm`, mas o projeto usa npm e versiona
   `package-lock.json`. Os comandos devem ser `npm run ...`.
2. O texto cita ESLint no frontend, enquanto o projeto adotou Oxlint. A regra
   deve exigir o gate configurado do stack, mantendo zero warning.
3. Os thresholds são definidos por camada, mas não há regra operacional para
   mapear diretórios/arquivos às camadas em coverage. Sem isso, um percentual
   global pode mascarar Service ou Repository sem teste.
4. “Uma [prova de contrato] por endpoint público” precisa esclarecer se cada
   operação exige ao menos sucesso e erros de domínio/autorização aplicáveis.
5. O requisito de plano aprovado não define onde registrar a aprovação. PR
   template ou ADR curto deve ser a evidência oficial.

## Sequência recomendada de aplicação

### Bloco 1 — restaurar a linha de base

- Investigar e corrigir a divergência `4381 × 4471`, preservando o teste.
- Resolver casing de Modal/Pagination e zerar warnings do frontend.
- Fazer testes, lint, typecheck e build passarem localmente.
- Atualizar os comandos da constituição para npm/Oxlint usados pelo projeto.

### Bloco 2 — CI mínimo bloqueante

- Criar workflow de PR/push para backend e frontend.
- Subir PostgreSQL efêmero, aplicar migrations e carregar fixtures
  determinísticas antes de executar todos os testes DB.
- Proibir skip silencioso no job de integração.
- Executar lint, typecheck, testes e build; todos com warning como erro.
- Configurar timeouts, cache seguro e artifacts de falha.

### Bloco 3 — cobertura e qualidade estática

- Adicionar Ruff, mypy e formatter Python com configuração explícita.
- Adicionar coverage backend e frontend com branch coverage.
- Aplicar thresholds por conjunto de paths/camada, começando pela medição da
  linha de base sem reduzir os pisos constitucionais.
- Publicar relatórios e bloquear regressão.
- Adicionar duplicação como alerta e complexidade ao processo de revisão.

### Bloco 4 — completar a pirâmide frontend

- Configurar jsdom e Testing Library.
- Testar primeiro services/API e hooks críticos, incluindo falhas.
- Cobrir componentes com comportamento de domínio e estados vazios/erro.
- Manter componentes puramente visuais fora do threshold específico.

### Bloco 5 — contratos e arquitetura backend

- Criar matriz das 29 operações HTTP e completar contrato por rota.
- Extrair gradualmente regras de routers para services e queries para
  repositories, mantendo testes unitários e integração PostgreSQL.
- Padronizar factories sintéticas e rollback/isolamento por teste.
- Adicionar teste de upgrade/downgrade das migrations em banco efêmero.

### Bloco 6 — E2E e governança

- Implementar poucos E2E para os fluxos críticos definidos pelo produto.
- Criar template de PR com plano, casos, trade-offs e evidência dos gates.
- Configurar status checks obrigatórios e revisão por área.
- Medir duração e flakiness; tratar instabilidade como incidente.

## Critérios para nota 10

- Linha principal e CI integralmente verdes, sem warnings.
- PostgreSQL efêmero reconstrói o cenário completo sem depender de banco
  carregado manualmente e sem skips silenciosos.
- Cobertura de linha e branch comprovada nos pisos de cada camada.
- Toda regra de negócio possui sucesso, erros de domínio e bordas relevantes.
- Toda operação pública possui contrato HTTP e autorização testados.
- Hooks, services e componentes com lógica atingem o piso frontend.
- Fluxos críticos possuem E2E poucos, estáveis e rastreáveis.
- Migrations sobem e descem de forma limpa em CI.
- Ruff, mypy, formatter, Oxlint, TypeScript e build bloqueiam merge.
- Branch protection, revisão e plano de testes têm evidência auditável.
- Não há flaky/skip permanente sem issue, responsável e prazo.

## Veredito

O projeto já tem uma boa cultura emergente de regressão no backend, mas ainda
depende do cuidado individual de quem executa e revisa. A aplicação da
constituição deve começar por tornar a linha de base verde e criar o CI; só
depois cobertura, novas camadas de teste e E2E passam a produzir confiança
mensurável em vez de volume de testes sem portão de entrega.
