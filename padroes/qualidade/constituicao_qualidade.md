
# Constituição de Testes & Qualidade IA v1.0

## 1. Filosofia do Documento

Este documento define a política de testes e qualidade de código obrigatória, compartilhada entre
frontend, backend, database e devops/infra. As constituições de [frontend](../frontend/constiuicao_frontend.md),
[backend](../backend/constituicao_backend.md), [database](../database/constituicao_database.md) e
[devops](../devops/constituicao_devops.md) trazem apenas um checklist local de teste — o "quanto",
o "como" e o critério de qualidade vivem aqui, em um único lugar, para nenhuma dessas pontas
ficar dessincronizada.

### Objetivos

- Teste que prova comportamento real, não teste que só existe para "ter cobertura".
- Qualidade medida por critério objetivo (cobertura mínima, lint, tipo, complexidade), não por
  impressão.
- Pipeline de CI (ver [constituicao_devops.md](../devops/constituicao_devops.md)) como único portão de
  verdade — código não passa por "parece bom" de quem revisou, passa porque o gate automatizado
  confirmou.

### Mandato transversal de diagnóstico

A atuação de Qualidade tem mandato para enriquecer os diagnósticos de
Database, Segurança, Backend, Frontend e DevOps sempre que encontrar evidência
verificável de impacto: falha de teste, cobertura insuficiente, contrato sem
prova, risco de fixture/dado, gate ausente ou contexto técnico desatualizado.
O enriquecimento registra evidência, impacto, recomendação e vínculo para o
diagnóstico de Qualidade; não autoriza mudar regra de negócio, dados reais,
infraestrutura ou nota de outra categoria sem validação pela respectiva
Constituição. Itens mortos comprovados e contexto obsoleto devem ser limpos ou
atualizados dentro desse mesmo limite.

---

## 2. PLAN MODE (Obrigatório para suíte de teste nova ou estratégia de qualidade)

Antes de criar uma suíte de teste nova (não um teste isolado de correção trivial) ou de definir
estratégia de qualidade para uma feature (ex.: o que precisa de E2E, o que só precisa de unidade), a
IA apresenta um plano contendo:

- **Camadas cobertas**: unidade, integração, contrato, E2E — quais se aplicam a esta mudança.
- **Casos obrigatórios**: caminho feliz, erro de domínio esperado, borda (vazio, limite, nulo).
- **O que não será testado e por quê**: trade-off explícito (ex.: "UI puramente visual sem lógica,
  coberta só por teste de smoke").
- **Fixtures/mocks necessários**: dado de teste novo, mock de serviço externo.
- **Impacto em CI**: novo tempo de execução relevante, novo serviço externo necessário no pipeline.

A implementação só começa após aprovação do plano.

---

## 3. Pirâmide de Testes

### Distribuição Esperada

```text
        ▲
       /E2E\          ← poucos, cobrindo fluxo crítico de ponta a ponta
      /------\
     /Integr. \       ← moderado, cobrindo integração entre camadas reais
    /----------\
   / Unidade    \     ← muitos, rápidos, cobrindo regra de negócio isolada
  /--------------\
```

| Camada | O que cobre | Velocidade | Volume esperado |
|---|---|---|---|
| Unidade | Regra de negócio isolada (Service, hook, função pura) | Milissegundos | Maioria dos testes |
| Integração | Repository + banco real/testcontainer, service + service | Segundos | Moderado |
| Contrato | Schema de request/response de rota, consumidor de API | Segundos | Uma por endpoint público |
| E2E | Fluxo de usuário completo (login → ação → resultado) | Minutos | Só o fluxo crítico do negócio |

### Proibido

- Suíte só de E2E "porque é mais fácil de escrever" sem teste de unidade cobrindo a regra de negócio
  isolada — E2E lento e frágil não substitui unidade rápida e precisa.
- Duplicar o mesmo caso em múltiplas camadas sem motivo (ex.: testar validação de schema em unidade
  E em E2E, quando E2E deveria assumir que a validação já está coberta).

---

## 4. O Que Testar (por camada do código)

### Backend (alinhado à Constituição Backend)

- **Service**: toda regra de negócio, caso de sucesso e todo erro de domínio possível
  (`NotFoundError`, `ValidationError`, `UnauthorizedError`).
- **Repository**: query com lógica não trivial (filtro composto, paginação, agregação) — contra banco
  real ou testcontainer, nunca só mock de driver.
- **Route/Controller**: contrato (schema de request/response, status code) — não repete a regra de
  negócio já testada no Service.

### Frontend (alinhado à Constituição Frontend)

- **Hooks**: estado, loading, error e ação retornados — casos de sucesso e de falha de service.
- **Componentes**: comportamento visível ao usuário (renderiza estado vazio, dispara ação no clique,
  mostra mensagem de erro) — não detalhe de implementação interna (nome de variável de estado,
  estrutura do DOM que não afeta o usuário).
- **Services**: erro de API normalizado corretamente em `ApiError` — schema Zod rejeita payload
  malformado.

### Database (alinhado à Constituição Database)

- Migração: `up` aplica limpo, `down` reverte limpo, testado em CI antes de produção.
- Constraint de integridade (FK, `CHECK`, `UNIQUE`): teste que confirma que a violação é rejeitada
  pelo banco, não só pela aplicação.

### Devops/Infra (alinhado à Constituição Devops)

- Build de imagem validado no pipeline antes de deploy.
- Smoke test pós-deploy confirmando que o serviço responde.

---

## 5. Padrão de Teste (Estrutura e Nomenclatura)

### Sintaxe Obrigatória: AAA ou Given-When-Then

Todo teste segue uma das duas estruturas abaixo — nunca lógica solta sem separação visível entre
preparação, execução e verificação.

**AAA (Arrange, Act, Assert)** — padrão para teste de unidade (Service, hook, função pura):

```ts
test("rejeita convênio sem valor global definido", () => {
  // Arrange
  const dadosInvalidos = criarConvenioFake({ valorGlobal: undefined });

  // Act
  const resultado = () => validarConvenio(dadosInvalidos);

  // Assert
  expect(resultado).toThrow(ValidationError);
});
```

**Given-When-Then** — preferido para teste de contrato/E2E e BDD (`describe`/`it` aninhado ou
ferramenta dedicada como Cucumber/Playwright BDD), quando o cenário é melhor comunicado como fluxo
de negócio para stakeholder não técnico:

```ts
describe("dado um convênio sem valor global definido", () => {
  describe("quando o usuário tenta submeter o formulário", () => {
    it("então exibe erro de validação e não chama a API", async () => {
      // Given
      const dadosInvalidos = criarConvenioFake({ valorGlobal: undefined });
      // When
      const { getByText } = renderComPreenchimento(dadosInvalidos);
      await userEvent.click(getByText("Salvar"));
      // Then
      expect(getByText(/valor global é obrigatório/i)).toBeInTheDocument();
    });
  });
});
```

Nunca misturar as duas estruturas dentro do mesmo teste (comentário `// Arrange` seguido de bloco
`describe("dado...")`) — escolher uma por teste e manter os comentários/nomes de bloco visíveis.

### Nomenclatura Descritiva

- Nome do teste descreve o comportamento esperado em linguagem de domínio, não a implementação:
  `"rejeita convênio sem valor global definido"`, nunca `"test1"`/`"deve funcionar"`.
- Agrupamento (`describe`/`class Test...`) pelo nome da unidade testada (`ConvenioService`,
  `useResultados`), não pelo nome do arquivo genérico.

### Independência

- Todo teste roda isolado, em qualquer ordem, sem depender de estado deixado por outro teste
  (`beforeEach` reseta fixture/mock, nunca estado global compartilhado entre testes).
- Teste de integração contra banco usa transação com rollback ao final, ou banco efêmero
  (testcontainer) — nunca dado que "sobra" de um teste para o próximo.

---

## 6. Cobertura de Edge Cases (Obrigatória)

Teste só de caminho feliz não é aceito como suíte completa — para toda unidade com regra de
negócio, os edge cases abaixo são avaliados explicitamente (cobertos, ou descartados por escrito no
plano da Seção 2 com o motivo):

| Categoria | Exemplos a considerar |
|---|---|
| Valor ausente/nulo | Campo obrigatório `undefined`/`null`, objeto vazio `{}` |
| Coleção vazia ou de 1 item | Lista `[]`, lista com um único elemento (quebra lógica de "primeiro"/"último"?) |
| Limite numérico | Zero, negativo, valor máximo permitido, valor um acima do limite |
| Duplicidade | Chamada repetida da mesma operação (idempotência), item duplicado em lista |
| Formato inválido | String malformada, tipo incompatível com o schema, encoding inesperado |
| Concorrência | Duas execuções simultâneas sobre o mesmo recurso (race condition) |
| Permissão/estado | Usuário sem permissão, recurso em estado que não permite a ação (já cancelado/já
  processado) |
| Falha de dependência externa | Timeout, erro 5xx de API externa, conexão de banco indisponível |

- Regra de negócio financeira, de idempotência ou de autorização (alinhado às Constituições Backend
  e Segurança) tem **cobertura de edge case obrigatória**, não opcional — PR sem esses casos não
  passa no code review (Seção 10).
- Edge case identificado e conscientemente não testado é registrado no PR/plano com o motivo — nunca
  simplesmente omitido em silêncio.

---

## 7. Mocks, Fixtures e Dados de Teste

### Política Estrita de Mock: Só I/O Externo

- Mockar **exclusivamente fronteira de I/O externo à unidade sob teste**: chamada de rede a API de
  terceiros, fila/mensageria, sistema de arquivo, relógio (`Date.now`), gerador aleatório — nunca
  regra de negócio do próprio domínio.
- **Proibido mockar o Service (ou equivalente de regra de negócio) que está sendo exercitado direta
  ou indiretamente pelo teste** — isso inclui mockar um Service ao testar outro Service que o chama
  de verdade no fluxo real; se a integração entre os dois é o comportamento sob teste, ambos rodam
  reais e só a borda externa (Repository/API) é mockada.
- Repository pode ser mockado ao testar Service isoladamente (isola a regra de negócio da forma de
  acesso a dado) — mas o próprio Repository precisa de teste de integração real cobrindo a query
  (Seção 4), nunca só validado via mock.
- Teste que mocka tanto o Service quanto o Repository ao mesmo tempo não está testando nada do
  domínio real — sinal de que a unidade sob teste está mal definida ou o teste é redundante.

### Fixtures

- Dado de teste construído por factory/builder nomeado por domínio (`criarConvenioFake`,
  `criarUsuarioFake`), nunca objeto literal solto e repetido em cada teste — centraliza a mudança
  de shape quando o schema evolui.
- Fixture nunca usa dado real de produção (alinhado à seção de dados sensíveis das Constituições
  Database/Segurança) — sempre sintético.

---

## 8. Cobertura de Código

### Métrica Mínima

| Camada | Cobertura mínima de linha/branch |
|---|---|
| Service / regra de negócio | 80% |
| Repository (query não trivial) | 70% |
| Route/Controller (contrato) | 60% |
| Hooks e componentes com lógica | 70% |
| Componente puramente apresentacional | Não exigido — coberto por E2E de smoke |

### Mapeamento obrigatório de camadas

- **Backend service/regra:** `backend/app/services/**` e funções de domínio
  isoladas explicitamente incluídas na configuração de coverage.
- **Backend repository:** `backend/app/repositories/**`.
- **Backend route/controller:** `backend/app/routers/**`.
- **Frontend hook/componente lógico:** `frontend/src/hooks/**` e componentes
  que possuem estado, efeito, mutation, formulário ou regra de interação.
- Bootstrap, tipos, mocks e componentes comprovadamente apresentacionais só
  podem ser excluídos por padrão de path e justificativa versionada; nunca por
  uma lista opaca de arquivos para elevar percentual.

O CI mede linhas e branches por esses grupos e bloqueia a queda abaixo do piso
da camada. Percentual global é informativo, nunca substitui o gate por camada.

### Cobertura Não é o Objetivo, é o Piso

- 100% de cobertura com `expect(true).toBe(true)` ou sem asserção de valor/contrato de retorno não
  conta como teste válido (proibido, alinhado à Constituição Backend) — cobertura mede execução de
  linha, não qualidade de asserção.
- Gate de CI bloqueia merge se a cobertura cair abaixo do mínimo da camada — nunca reduzir o
  threshold para "fazer o pipeline passar".

---

## 9. Qualidade Estática (Lint, Tipo, Complexidade)

### Gates Obrigatórios (bloqueiam merge)

- Lint sem warning (Oxlint no frontend e Ruff no backend) — zero tolerância a warning acumulado.
- Typecheck sem erro (`tsc --noEmit`, `mypy`) — zero `any`/`dict` genérico não justificado.
- Formatação automática (Prettier/Black) aplicada — nunca diff de formatação misturado com diff de
  lógica no mesmo commit.

### Complexidade

- Função com complexidade ciclomática alta (regra prática: acima de ~10) é candidata a quebrar em
  passos nomeados — alinhado ao limite de tamanho de função da Constituição Backend (~40-50 linhas)
  e de componente da Constituição Frontend (~200 linhas).
- Duplicação de lógica (não de estrutura) acima de ~3 ocorrências é candidata a extração — ferramenta
  de análise de duplicação (`jscpd` ou equivalente) roda no CI como alerta, não bloqueio automático.

---

## 10. Revisão de Código (Code Review)

### Checklist do Revisor

- Plano aprovado antes da implementação (Seção 2 de cada constituição) — PR sem plano prévio para
  mudança não trivial é motivo de solicitar revisão do processo, não só do código.
- Teste cobre o caso de erro, não só o caminho feliz.
- Nome de função/variável no termo de domínio real (alinhado à seção "Anti Cara de IA" de cada
  constituição), não genérico.
- Nenhum `console.log`/`print` de debug esquecido, nenhum código morto/comentado.
- Segredo, dado sensível ou credencial não aparece no diff (alinhado à
  [constituicao_seguranca.md](../seguranca/constituicao_seguranca.md)).

### Evidência versionada

- Mudança não trivial usa o template de PR em `.github/PULL_REQUEST_TEMPLATE.md`
  para registrar plano, camadas, edge cases, fixtures/mocks, impacto em CI e
  trade-offs. O link ao plan-mode aprovado é a evidência de aprovação prévia.
- Cada operação HTTP pública tem teste de sucesso e os erros de autenticação,
  validação e domínio que lhe forem aplicáveis; a matriz de contratos aponta o
  arquivo de teste. Não se exige erro impossível para uma rota, nem se aceita
  marcar contrato como completo sem teste executável.

### Tamanho de PR

- PR pequeno e de escopo único (uma feature, uma correção) é revisado mais rápido e com mais atenção
  real — PR gigante misturando refatoração com feature nova é dividido antes da revisão, sempre que
  possível.

---

## 11. Testes de Regressão e Flakiness

### Bug Corrigido Sempre Ganha um Teste

- Todo bug relatado em produção gera um teste de regressão que falha antes da correção e passa
  depois — nunca corrigir sem cobrir o cenário que causou a falha.

### Teste Instável (Flaky)

- Teste que falha de forma intermitente sem mudança de código é tratado como incidente de
  qualidade, não silenciado com `retry`/`skip` permanente — a causa raiz (dependência de tempo real,
  ordem de execução, race condition assíncrona) é corrigida ou o teste é reescrito.
- Proibido `it.skip`/`test.skip` deixado no código sem issue/comentário explicando o motivo e prazo
  de retomada.

---

## 12. Anti "Cara de IA" em Testes

O equivalente, em teste, a uma UI genérica é: teste que sempre passa porque não afirma nada real,
mock que substitui a própria lógica que deveria estar sendo validada, e nome de teste que não diz o
que o negócio espera.

### Nunca

- Teste que só confirma "não lançou exceção", sem checar o valor/contrato de retorno (proibido,
  alinhado à Constituição Backend).
- Assert genérico (`expect(result).toBeTruthy()`) quando o valor exato esperado é conhecido e
  checável.
- Mock de toda a cadeia de dependências a ponto de o teste validar o mock, não o código real.
- Copiar teste de outra feature e só trocar o nome, sem adaptar os casos de borda ao domínio real.
- Teste comentado/`skip` "temporariamente" que nunca mais é revisitado.

### Sempre

- Nome de teste em linguagem de domínio, descrevendo o comportamento esperado.
- Caso de erro de domínio testado com o mesmo rigor do caminho feliz.
- Fixture/factory nomeada por domínio, reaproveitada entre testes da mesma unidade.
- Teste de regressão para todo bug de produção corrigido.

---

## 13. Definição de Pronto (Definition of Done)

Uma mudança só é considerada pronta quando:

- [ ] Plano aprovado (Seção 2 desta constituição, quando aplicável).
- [ ] Teste de unidade cobrindo regra de negócio (sucesso e erro de domínio).
- [ ] Teste de integração/contrato quando a camada exige (query não trivial, rota pública).
- [ ] Cobertura mínima da camada atingida (Seção 8).
- [ ] Lint, typecheck e formatação sem erro/warning.
- [ ] Nenhum teste `skip`/comentado sem justificativa registrada.
- [ ] Code review aprovado com o checklist da Seção 10.
- [ ] Pipeline de CI (lint → typecheck → test → build) verde antes do merge.

---

## 14. Fluxo de Implementação

1. Teste de unidade escrito junto com (ou antes de) a implementação da regra de negócio.
2. Teste de integração/contrato para a camada de acesso a dado/exposição HTTP.
3. Rodar suíte local completa antes de abrir PR.
4. Code review com checklist da Seção 10.
5. CI verde (todos os gates da Seção 9) como condição de merge.

### Validação obrigatória

```bash
# Node/TypeScript
npm run lint
npm run typecheck
npm run test -- --coverage

# Python
ruff check .
mypy .
pytest --cov
```

---

## 15. Checklist de Entrega

- [ ] Plano de estratégia de teste aprovado, quando aplicável.
- [ ] Pirâmide respeitada — unidade cobrindo regra de negócio, sem depender só de E2E.
- [ ] Caso de sucesso e caso de erro de domínio cobertos.
- [ ] Cobertura mínima da camada atingida (Seção 8), sem teste vazio de asserção.
- [ ] Fixture/factory nomeada por domínio, sem dado real de produção.
- [ ] Nenhum teste `skip`/flaky sem causa raiz corrigida ou justificativa registrada.
- [ ] Bug de produção corrigido com teste de regressão correspondente.
- [ ] Lint, typecheck, formatação e testes passando localmente antes do PR.
- [ ] Code review aprovado com checklist da Seção 10.
- [ ] Pipeline de CI verde antes do merge.

---

## Prompt de Referência

Atue como Senior QA/Test Engineer. Siga rigorosamente esta Constituição de Testes & Qualidade:

1. Respeite a pirâmide de testes — unidade cobrindo regra de negócio real, integração para
   acesso a dado, E2E só para fluxo crítico — nunca só E2E "porque é mais fácil".
2. Todo teste afirma um valor/contrato real de retorno; nunca `expect(true).toBe(true)` ou
   assert genérico quando o valor exato é conhecido.
3. Mocke só fronteira externa; nunca mocke a própria unidade sob teste ou sua colaboradora de
   domínio direta.
4. Nome de teste em linguagem de domínio, cobrindo explicitamente o caso de erro, não só o
   caminho feliz.
5. Todo bug de produção corrigido ganha um teste de regressão antes de ser considerado resolvido.
6. Nenhum merge acontece com lint, typecheck ou teste falhando, nem com cobertura abaixo do
   mínimo da camada, nem com teste `skip`/flaky sem causa raiz tratada.
</content>
