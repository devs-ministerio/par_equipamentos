# Diagnóstico da Constituição de Testes & Qualidade — 2026-09-24

## Escopo e método

Este diagnóstico reavalia a aderência a
`padroes/qualidade/constituicao_qualidade.md`, usando como linha de base o
diagnóstico de 2026-09-16. Abrange backend, frontend, banco de teste, E2E e
gates versionados no GitHub Actions.

Foram executados os gates locais no estado do repositório em 24/09 e
consultadas as últimas execuções de CI. A suíte backend usou exclusivamente o
PostgreSQL local dedicado de testes no OrbStack; não houve leitura nem escrita
no Neon ou em produção. Não foi alterado código produtivo neste diagnóstico.

## Resumo executivo

O SIGEO saiu de uma linha de base de **3,8/10** para **7,0/10** em aderência à
Constituição de Qualidade. A mudança é material: há CI separado para backend e
frontend, lint e tipagem verdes, builds verdes, 197 testes backend (189
aprovados), 81 testes frontend aprovados, testes de hooks/componentes/services
e uma suíte Playwright inicial.

O principal impeditivo para uma nota alta é mensuração e enforcement: cobertura
por camada não está configurada nem bloqueia regressão; o frontend não possui
provedor de cobertura versionado; e o CI não executa E2E. Além disso, oito
testes de integração essenciais são pulados porque a fixture do CI só semeia
monitoramento, não o cenário de cobertura CNES/SUS. Portanto, uma execução
verde ainda não demonstra integralmente a pirâmide exigida pela constituição.

## Evidências atuais

| Verificação | Resultado em 24/09 |
|---|---|
| Backend: Ruff | `ruff check .` aprovado |
| Backend: tipos | `mypy .` aprovado em 175 arquivos; 2 notas para corpos de funções de teste sem anotação não verificados |
| Backend: testes | 189 aprovados, 8 pulados, 2 avisos de depreciação; 197 coletados |
| Backend: cobertura exploratória | 77% total (linha/branch combinadas); sem threshold ou relatório no CI |
| Frontend: lint | `npm run lint` aprovado |
| Frontend: tipos e build | `npm run typecheck` e `npm run build` aprovados |
| Frontend: testes | 21 arquivos, 81 testes aprovados |
| Frontend: cobertura | não mensurável: `@vitest/coverage-v8` não é dependência/configuração versionada |
| E2E | 3 cenários Playwright (barreira de rota, login, responsividade); não é executado no CI |
| CI GitHub | últimos gates backend e frontend concluídos com sucesso em 24/09 |

As duas advertências backend vêm de APIs do Starlette/HTTPX em depreciação
(`TestClient` e constante HTTP 422), não de falha de produto. Ainda assim,
violam a meta de execução sem warning acumulado e devem ser eliminadas.

## Aderência por eixo

### Conformes ou substancialmente evoluídos

- Há 40 arquivos de teste backend cobrindo autenticação, CSRF, integrações
  externas, pipelines, regras de cobertura, integridade, monitoramento,
  notificações, usuários e migrations.
- Há testes de contrato HTTP e de autorização, além de testes PostgreSQL reais
  para constraints, transações, schema e queries não triviais.
- A proteção de `TEST_DATABASE_URL` impede que a suíte use acidentalmente o
  banco principal. O seed de monitoramento é determinístico e idempotente.
- O frontend agora tem 21 suítes: lógica pura, cliente HTTP, services, hooks,
  componentes de formulário, feedback de erro/vazio, filtros e cabeçalho.
- Lint, typecheck, testes e build são gates versionados em workflows distintos;
  os últimos runs consultados estão verdes.
- Não foram encontrados `test.only`, `xfail`, asserts vazios ou skips sem
  motivo. Os skips existentes descrevem a ausência de dado de fixture.
- Há três cenários E2E com Playwright, credenciais somente por variáveis de
  ambiente e execução serial para respeitar o limite de login.

### P0 — cobertura exigida, mas não controlada

1. A constituição exige mínimos por camada (service 80%, repository 70%, rota
   60%, hook/componente lógico 70%). Não há mapeamento de paths, relatório
   versionado nem threshold bloqueante em nenhum workflow.
2. A medição exploratória do backend foi **77% total**, que não prova os
   mínimos por camada. Há lacunas relevantes: `equipment_offer` (14%),
   `municipality_coverage` (15%), `macro_coverage` (31%), services de
   marcadores (32%) e pipelines de APIs externas (43–57%).
3. O frontend executa Vitest sem provider de coverage. A tentativa de medição
   transitória não pôde gerar dados justamente porque o provider não integra o
   ambiente do projeto. Não se deve inferir cobertura a partir de 81 testes.

### P1 — integração de cobertura depende de estado ausente

1. O CI aplica migrations e semeia apenas monitoramento. Não carrega um
   conjunto sintético de `Execution`, `EquipmentOfferRow` e
   `MunicipalityCoverage`.
2. Por isso, três testes de totais e quatro de cobertura municipal são pulados;
   um teste de FK também fica condicional. São **8 skips** no total, todos
   justificáveis, mas a cobertura de regras centrais SUS/em uso não é
   obrigatória no CI.
3. Deve existir uma fixture única, sintética e pequena que permita executar
   esses casos sem `skip`, preservando os testes de invariância já existentes.

### P1 — E2E não é uma garantia de entrega

1. Playwright não roda em GitHub Actions nem possui provisionamento de browser,
   URL de ambiente e segredo E2E no workflow. Assim, login e responsividade
   não bloqueiam regressão em PR.
2. Neste host a execução direta não alcançou os asserts: o sandbox macOS negou
   a porta de rendezvous do Chromium headless. É limitação do executor local,
   não evidência de defeito da aplicação. As credenciais E2E também não estão
   injetadas neste processo.
3. Os specs chamam `test.skip` dentro do corpo do teste autenticado. Como o
   fixture `page` é criado antes do corpo, o browser ainda precisa iniciar sem
   credenciais. O plano deve mover a condição para o nível de definição do
   teste ou separar o cenário anônimo, tornando o skip realmente independente
   do browser.

### P1 — contratos ainda são parciais

Há 42 operações de rota e há boa cobertura de domínios sensíveis, especialmente
monitoramento e autenticação. Porém não existe uma matriz versionada
operação × sucesso × erro de domínio × autorização. Rotas de oferta de
equipamentos, cobertura municipal e cobertura macro são justamente as que
aparecem com menor cobertura exploratória. A matriz deve priorizar essas
rotas, sem duplicar regra já coberta em service.

### P2 — estática, governança e contexto

- Ruff e mypy estão configurados, mas o mypy não usa modo estrito nem
  `check_untyped_defs`; as duas notas observadas comprovam a lacuna.
- Ruff só seleciona `E`, `F` e `I`; não há formatter Python nem verificação de
  formatação frontend. A exceção de imports é deliberada e fechada para
  migrations históricas, portanto não é código morto a remover.
- Não há análise de complexidade/duplicação no CI. Arquivos grandes continuam
  candidatos à revisão por responsabilidade: `models.py` (1.296 linhas),
  `routers/monitoramento.py` (954), `services/monitoramento_eventos.py` (566),
  `services/api.ts` (435) e `utils/export-xlsx.ts` (388).
- Não há evidência versionada de template/checklist de PR, catálogo de testes
  flaky ou regra automática de teste de regressão para bugs.
- A constituição está desatualizada em dois pontos operacionais: ainda cita
  `pnpm` e ESLint, enquanto o repositório usa `npm`/`package-lock.json` e
  Oxlint. O documento histórico de 16/09 foi marcado como substituído para
  não ser tomado como estado atual.

## Itens mortos e contexto

Não foi encontrado código morto comprovado para remoção nesta rodada. Os usos
de “legado” encontrados representam compatibilidade de SICONV/TransfereGov ou
migrations históricas documentadas; removê-los sem migration de contrato seria
regressão. Artefatos temporários criados durante a medição (coverage e
resultados Playwright) foram removidos e não permaneceram no repositório.

O contexto histórico de qualidade foi atualizado com ponte explícita para este
diagnóstico. A atualização da constituição para comandos reais deve fazer parte
do próximo plan-mode, junto com a definição operacional dos thresholds, para
não transformar um texto em gate ambíguo.

## Nota e próximos blocos recomendados

**Nota atual: 7,0/10.** A linha de base está verde e protegida por CI, mas não
é possível declarar conformidade plena enquanto os pisos de cobertura, os
cenários de dados críticos e o E2E não forem gates reproduzíveis.

1. **Medição e piso:** adicionar providers de coverage, branch coverage e
   thresholds por diretório/camada, primeiro como relatório de baseline e em
   seguida como gate sem redução dos mínimos constitucionais.
2. **Fixture de integração:** reconstruir, no CI, um conjunto sintético mínimo
   para cobertura/macro/oferta; remover os oito skips condicionais desses
   domínios.
3. **Contratos:** criar a matriz de 42 operações e completar primeiro as rotas
   com cobertura baixa, incluindo 401/403/422 e erro de domínio aplicáveis.
4. **E2E em CI:** provisionar Chromium, segredo de conta descartável e URL
   segura; executar os poucos fluxos críticos após deploy de preview ou stack
   efêmero. Separar o smoke anônimo dos testes autenticados.
5. **Higiene estática:** eliminar os dois avisos, ampliar mypy de modo
   progressivo, adicionar formatter e análise de complexidade/duplicação como
   alerta. Atualizar a constituição de `pnpm`/ESLint para npm/Oxlint.

Esses blocos exigem um novo plan-mode de qualidade antes de implementação,
conforme a própria constituição.
