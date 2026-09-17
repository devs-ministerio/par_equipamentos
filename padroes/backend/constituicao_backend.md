
# Constituição Backend IA v1.0

## 1. Filosofia do Projeto

Este documento define as regras obrigatórias para qualquer implementação backend realizada por IA.

### Objetivos

- Código limpo, previsível e escalável.
- APIs com contrato explícito, sem "gambiarra de tipagem" nem atalho que pareça gerado sem contexto de domínio ("cara de IA" no backend = `any`/`dict` genérico, `SELECT *`, endpoint sem paginação, erro cru vazando stack trace, nome de função que não diz o que o negócio faz).
- Padronização entre todos os projetos (Node/TypeScript, Python, ou o stack vigente do projeto).

---

## 2. PLAN MODE (Obrigatório)

Antes de gerar qualquer código (exceto correções triviais de 1 linha), a IA deve apresentar um plano contendo:

### Objetivo

- O que será implementado.
- Impacto esperado (novo endpoint, migração de schema, mudança de contrato).

### Arquivos afetados

- src/routes/...
- src/services/...
- src/repositories/...
- src/schemas/... (validação de entrada/saída)
- src/errors/...

### Estratégia

- Camadas envolvidas (Route → Service → Repository).
- Entidades/contratos novos ou reutilizados.
- Queries e origem do dado (OLTP relacional vs. OLAP/Parquet).

### Dados

- Schema de entrada (request) e saída (response).
- Migração de banco, se houver.
- Fonte: banco relacional, arquivo colunar, API externa.

### Resiliência

- Cenários de erro previstos (não encontrado, não autorizado, conflito, timeout externo).
- Necessidade de idempotência (operação financeira, carga de dados, repasse).
- Paginação/limite, se retorna lista.

### Riscos

- Breaking change de contrato de API (quebra o frontend consumidor).
- Migração de dados existentes.
- Performance (volume de dados, N+1 query, ausência de índice).

A implementação só começa após aprovação do plano.

### Formato do Plano

- O plano deve ser **conciso e direto ao ponto**, em formato de tópicos (bullet points), com **no máximo 30-40 linhas**.
- Não incluir código no plano — apenas estrutura lógica, decisões e caminhos de arquivos.
- Priorizar clareza sobre exaustividade: detalhar apenas o que muda o resultado ou exige aprovação.

---

## 3. Arquitetura

### Separação Rígida de Responsabilidades (Layered Architecture)

```text
src/
├── routes/         # Controller: recebe request, valida schema de entrada, retorna HTTP
├── services/        # Use Case: toda a regra de negócio, sem req/res
├── repositories/     # Única camada autorizada a fazer query direta (DB, Parquet, API externa)
├── schemas/         # Contratos de entrada/saída (Zod, Pydantic, DTOs)
├── errors/          # Hierarquia de erros de domínio
└── lib/            # Infra transversal (logger, cliente HTTP, conexão de banco)
```

| Camada | Pode fazer | Nunca faz |
|---|---|---|
| Route/Controller | Validar input, chamar Service, formatar resposta HTTP | Regra de negócio, query direta |
| Service/Use Case | Orquestrar regra de negócio, chamar Repository | Acessar `req`/`res`, montar SQL |
| Repository | Query direta no banco/Parquet/API externa | Regra de negócio, validação de domínio |

### Contrato Repository/Service em Python (SQLAlchemy)

Exemplo mínimo funcional citável: `backend/app/repositories/propostas_candidatas.py` +
`backend/app/services/propostas_candidatas.py` (par de referência do Plan Mode backend
2026-09-17, Bloco B — não duplicar em exemplo sintético).

- **Repository**: funções soltas (sem classe), `db: Session` como **primeiro parâmetro
  posicional**. Nunca chama `db.commit()`/`db.rollback()` — só monta e executa query
  (`select`/`update`/`delete`), devolve entidade/`tuple`/`list`, nunca decide status HTTP.
- **Service**: funções soltas, `db` sempre **keyword-only** (`*, db: Session`) — a assinatura
  por si só já sinaliza "isto é orquestração, não leitura simples" e evita passar `db`
  posicional por engano entre as duas camadas. É o **único lugar que chama `db.commit()`** —
  se uma operação precisa de mais de um Repository (ex.: criar instrumento + revisar proposta),
  o Service é quem garante que tudo fecha numa única transação. Levanta `DomainError` (ou
  subclasse — ver `backend/app/domain_errors.py`) para qualquer erro de regra de negócio,
  **nunca `fastapi.HTTPException`** — Service não importa FastAPI.
- **Router**: só monta `Depends`, chama o Service, devolve o retorno como `response_model`.
  Nunca `commit()`/`refresh()`/query direta no Router — se isso aparecer, é sinal de que a
  lógica devia estar no Service (ver `monitoramento.py` como padrão a **não** seguir: commit
  feito no Router em 5 pontos — regra prospectiva daqui pra frente, migrar esse arquivo é bloco
  futuro, não deste Plan Mode).
| Repository | Query direta no banco/Parquet/API externa | Regra de negócio, validação de domínio |

### Design Orientado a Dados e Imutabilidade

- Preferir dados imutáveis ao longo do fluxo. Transformar o dado gerando novos contratos, nunca alterando o payload original de forma destrutiva.

### Nomenclatura de Arquivos

| Tipo | Padrão | Exemplo |
|---|---|---|
| Routes/Controllers | `kebab-case.ts` (ou `snake_case.py`) | `convenio-routes.ts` |
| Services | `kebab-case.ts` | `convenio-service.ts` |
| Repositories | `kebab-case.ts` | `convenio-repository.ts` |
| Schemas | `kebab-case.ts` em `schemas/[feature].ts` | `schemas/convenio.ts` |
| Erros de domínio | `PascalCase` + sufixo `Error` | `NotFoundError`, `DomainError` |

Nunca misturar convenções dentro do mesmo diretório.

### Padrão de Resposta Unificado

Toda resposta da API segue a mesma estrutura envelopada, sucesso e erro:

```ts
// sucesso
{ "success": true, "data": T, "meta"?: { page, limit, total } }

// erro
{ "success": false, "error": { "code": string, "message": string } }
```

---

## 4. Tipagem, Validação e Contratos

### Validação Rígida nas Fronteiras (Parse, Don't Validate)

- Nenhuma requisição entra no Service sem antes ser parsed/validada por um schema estrito na entrada (Zod, Pydantic ou DTO fortemente tipado).
- Resposta de fonte externa (API de terceiros, arquivo Parquet) também passa por schema antes de virar dado confiável dentro do domínio — nunca repassar dado não validado adiante.

### Tipagem Estrita e Contrato Único

### Obrigatório

- Schema de entrada (request).
- Schema de saída (response).
- Tipo derivado do schema (`z.infer`, `pydantic.BaseModel`) — nunca tipo manual desacoplado do contrato real.

### Proibido

- `any` (TypeScript) ou `dict`/`object` genérico sem schema (Python).
- `as any` / cast para escapar de erro de tipo.

### Padrão RESTful Semântico

- Verbos HTTP corretos: `GET` (leitura idempotente), `POST` (criação), `PATCH`/`PUT` (atualização), `DELETE` (remoção).
- Status codes coerentes: `200` OK, `201` Created, `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `422` Unprocessable Entity, `500` Internal Error.

---

## 5. Engenharia de Dados & Query Performance

### Queries Explícitas e Mapeadas

- Proibido `SELECT *` em tabelas operacionais ou analíticas de produção. Toda projeção de coluna deve ser explícita.

### Separação de OLTP e OLAP

| Tipo de operação | Onde serve |
|---|---|
| Transacional rápida (cadastro, status, autenticação) | Banco relacional (PostgreSQL/Oracle) |
| Agregado/métrica em volume alto (SICONV, DataSUS, Transferegov) | Arquivo colunar (Parquet) via engine otimizada (DuckDB/Polars) |

### Paginação e Limitação Obrigatórias

- Toda consulta que retorna lista é paginada por padrão (cursor ou offset), com `limit` máximo pré-definido no servidor — nunca lista sem teto de tamanho.

---

## 6. Tratamento de Erros & Resiliência

### Tratamento Descritivo e Semântico

- Nunca retornar stack trace ou exceção crua de banco para o cliente.
- Hierarquia de erros customizados (`DomainError`, `NotFoundError`, `UnauthorizedError`, `ValidationError`) com código único e mensagem clara em português.

```ts
class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

class NotFoundError extends DomainError {
  constructor(entity: string) {
    super("NOT_FOUND", `${entity} não encontrado`, 404);
  }
}
```

### Fail-Fast

- Validar pré-condições (parâmetro ausente, permissão, ID inválido) no início da execução, antes de abrir conexão de banco ou processamento pesado.

### Idempotência em Operações Críticas

- Processamento financeiro, carga de dados e repasse de convênio deve suportar execução múltipla sem efeito colateral duplicado (chave de idempotência, upsert em vez de insert cego).

---

## 7. Observabilidade e Registros (Logging)

### Structured Logging

- Todo log em formato JSON com metadados de contexto: `timestamp`, `trace_id`, `user_id`, `endpoint`, `duration_ms`.

### Níveis de Log

| Nível | Uso |
|---|---|
| `DEBUG` | Detalhe de fluxo, só em desenvolvimento local |
| `INFO` | Evento importante de negócio (ex.: "Convênio #904824 processado com sucesso") |
| `WARN` | Anomalia recuperável (ex.: "Falha temporária em API externa, executando retry") |
| `ERROR` | Falha não tratada ou que exige intervenção manual |

### Métricas de Performance

- Monitorar e registrar tempo de resposta de rota e de consulta a banco/dataset analítico, para identificar gargalo cedo.

---

## 8. Segurança

> Política completa e detalhada em [constituicao_seguranca.md](../seguranca/constituicao_seguranca.md).
> Esta seção é o checklist mínimo de aplicação no backend — em caso de dúvida ou cenário não
> coberto aqui (auth, CORS, LGPD, rate limit, headers), consultar o documento compartilhado.

- [ ] Credencial/segredo só via `.env`, nunca hardcoded, nunca versionado — inicialização falha se faltar variável obrigatória.
- [ ] Consulta sempre parametrizada (prepared statements) — nunca concatenar string de usuário em query.
- [ ] Toda rota não explicitamente pública exige autenticação.
- [ ] Autorização (permissão/role) checada no Service — nunca delegada só ao frontend.
- [ ] IDOR: busca por ID valida que o recurso pertence/é acessível ao usuário autenticado.
- [ ] Rate limiting em endpoint de autenticação e endpoint público sensível.
- [ ] CORS com origem explícita (nunca `*` com credencial); headers de segurança configurados (CSP, HSTS, `nosniff`, `frame-options`).
- [ ] Dado sensível (CPF, dado financeiro, credencial) nunca em log, mensagem de erro ou resposta além do necessário.
- [ ] Resposta de erro ao cliente sem stack trace/detalhe de infraestrutura.
- [ ] Dependência auditada (`npm audit`/`pip-audit`), sem CVE crítica sem mitigação.

---

## 9. Código Limpo e Eficiência (Anti "Cara de IA")

O equivalente, no backend, a uma UI genérica é: nome de função vago, camada duplicando responsabilidade de outra, query ineficiente copiada sem pensar em volume real de dado, e tratamento de erro genérico que não diz nada ao consumidor da API.

### Nunca

- Nome de função/variável genérico (`data`, `handleStuff`, `processData`) quando existe um termo de domínio real disponível.
- Lógica de negócio dentro de Route/Controller "porque é mais rápido".
- Camada Repository devolvendo entidade de banco crua sem passar por schema/mapper.
- Try/catch vazio ou que só faz `console.log(err)` e segue.
- Comentário explicando o óbvio (`// incrementa contador`) em vez de explicar a decisão não óbvia.
- Query dentro de loop (N+1) quando um `JOIN`/`IN` resolve em uma chamada.
- Endpoint que devolve todos os campos da tabela "porque é mais fácil" em vez do contrato explícito que o consumidor precisa.

### Sempre

- Nome de função declarativo e específico do domínio (`calcularExecucaoOrcamentariaConvenio`, não `calcData`).
- Uma função faz uma coisa; funções grandes (regra prática: acima de ~40-50 linhas de lógica real) são candidatas a quebrar em passos nomeados.
- Erro de domínio específico por caso (`ConvenioNaoEncontradoError`, não `Error("erro")` genérico).
- Reuso de schema/tipo existente antes de criar um novo contrato parecido.
- Consulta desenhada para o volume real de dado (índice, paginação, projeção de coluna) — não só "funciona com 10 registros de teste".

---

## 10. Testes

> Política completa em [constituicao_qualidade.md](../qualidade/constituicao_qualidade.md) (pirâmide
> de testes, edge cases obrigatórios, política de mock, cobertura mínima por camada). Esta seção é
> o resumo de aplicação no backend.

### Obrigatório

- Teste de unidade para regra de negócio em Service (casos de sucesso e de erro de domínio).
- Teste de integração para Repository quando a query tem lógica não trivial (filtro composto, paginação).
- Teste de contrato para Route (schema de request/response, status code).

### Proibido

- Mock do próprio domínio que está sendo testado (mockar Service ao testar o próprio Service).
- Teste que só confirma que a função não lança exceção, sem checar o valor/contrato de retorno.

---

## 11. Fluxo de Implementação

1. Contratos (schemas de entrada/saída) e tipos.
2. Repository (acesso a dado).
3. Service (regra de negócio).
4. Route (exposição HTTP).
5. Testes.
6. Validação.

### Validação obrigatória

```bash
# Node/TypeScript
npm run lint
npm run typecheck
npm run test

# Python
ruff check .
mypy .
pytest
```

---

## 12. Checklist de Entrega

- [ ] Plan aprovado.
- [ ] Camadas separadas (Route → Service → Repository), sem regra de negócio na Route.
- [ ] Schema de entrada e de saída validados (nenhum `any`/`dict` genérico).
- [ ] Sem `SELECT *` — projeção de coluna explícita.
- [ ] Paginação/limite aplicado em toda lista.
- [ ] Erros tratados com hierarquia de domínio — nenhum stack trace cru exposto.
- [ ] Idempotência garantida em operação crítica (financeiro/carga de dados), se aplicável.
- [ ] Logs estruturados (JSON) nos pontos relevantes.
- [ ] Segredo/credencial só via `.env`, com validação de inicialização.
- [ ] Query parametrizada — sem concatenação de string de usuário.
- [ ] Nome de função/variável específico do domínio, sem termo genérico.
- [ ] Testes de unidade (Service) e contrato (Route) escritos e passando.
- [ ] Sem console.log/print de debug esquecido.
- [ ] Sem código morto.
- [ ] Lint, typecheck e testes passando.

---

## Prompt de Referência

Atue como Senior Backend Architect. Siga rigorosamente esta Constituição de Backend:

1. Mantenha a separação em camadas (Route → Service → Repository) — regra de negócio nunca na Route, query direta nunca no Service.
2. Valide 100% dos inputs e outputs com schema estrito e tipagem forte — proibido `any`/`dict` genérico.
3. Nunca use `SELECT *`; projete colunas explicitamente e pagine toda lista.
4. Trate erros com exceções de domínio customizadas e respostas JSON envelopadas — nunca stack trace cru para o cliente.
5. Nomeie funções e variáveis com termos reais do domínio de negócio, nunca genéricos (`data`, `handleStuff`).
6. Escreva testes de unidade para regra de negócio e de contrato para rotas antes de considerar a entrega pronta.
