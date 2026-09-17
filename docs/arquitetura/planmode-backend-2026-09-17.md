# Plan Mode — backend (2026-09-17)

Cobre o "Bloco 1 — fundação backend sem quebrar o frontend" recomendado por
`diagnostico-constituicao-backend-2026-09-16.md`: hierarquia de erro de domínio, contrato de
Repository/Service, uma feature-piloto migrada para Router→Service→Repository, gates de
lint/typecheck, e remoção de código morto comprovado. Formato conforme
`padroes/backend/constituicao_backend.md` Seção 2. Os 3 achados **P0 de banco** do mesmo diagnóstico
(rotação de refresh token, seleção de URL de migration, downgrade de migration) já foram resolvidos
por `planmode-database-2026-09-17.md` — não entram aqui. O único P0 restante (CSRF em autenticação
por cookie) é escopo de **segurança & auth**, que antecede backend na ordem de `padroes/AGENTS.md`
Seção 2.2 (`database → segurança & auth → backend → ...`) — fica fora deste Plan Mode.

Investigação prévia (sem alterar nada) confirmou, no código atual:

- **`notificacoes`** (`backend/app/routers/notificacoes.py`, 89 linhas) é router monolítico: schemas
  Pydantic inline, 3 queries diretas, `HTTPException`/`db.commit()`/`db.refresh()` no próprio router
  — pequeno, isolado (só depende de `Notificacao`/`NotificacaoTipo`), com escrita real
  (`marcar_lida`). Candidato ideal a piloto — já existe, não precisa ser inventado.
- **Único Repository hoje**, `propostas_candidatas.py` (75 linhas): módulo de funções soltas,
  `Session` por parâmetro posicional, sem `commit()` — padrão correto e reaproveitável. O Service
  correspondente já commita corretamente dentro de si, mas levanta `fastapi.HTTPException` direto
  (`grep -rn "class .*Error" backend/app/` não encontra nenhuma hierarquia de erro de domínio hoje).
- **`backend/app/errors.py`** já existe e funciona, mas só como tradutor "de fora" — intercepta
  `HTTPException`/`RequestValidationError`/`Exception` genérica; nada intercepta erro de domínio
  porque erro de domínio não existe ainda.
- **3 schemas mortos confirmados** (`ErrorResponse`, `UserCreate`, `TokenPayload` em
  `backend/app/schemas.py`) — zero consumidor real em todo o backend.
- **ruff/mypy** não instalados no ambiente (`uv run ruff --version`/`uv run mypy --version` falham),
  sem config em `backend/pyproject.toml`.
- **Divergência de padrão transacional** em `monitoramento.py` (commit no Router, 5x) vs.
  `propostas_candidatas` (commit no Service) — este Plan Mode declara o padrão-alvo mas **não**
  migra `monitoramento.py` (767 linhas — bloco seguinte do próprio diagnóstico, fora de escopo aqui).

## Bloco A — Hierarquia `DomainError` + tradutor central (P1)

**Objetivo**: introduzir erro "de dentro" (domínio) que os Services levantam, traduzido pra HTTP num
único lugar. Hoje os únicos Services reais (`propostas_candidatas.py`, `authz.py`) já levantam
`HTTPException` direto, acoplando regra de negócio a FastAPI — o achado P1.3 do diagnóstico
("Services... importam `HTTPException`") é exatamente isso.

**Arquivos afetados**: `backend/app/domain_errors.py` (novo — não em `errors.py`, que já tem
identidade fixada como tradutor HTTP; separar deixa explícito, por import, quando um Service depende
de FastAPI); `backend/app/errors.py` (handler novo); `backend/app/authz.py`,
`backend/app/services/propostas_candidatas.py` (migração).

**Estratégia**: `DomainError(Exception)` base + 4 subclasses cobrindo exatamente os status já usados
nos Services reais, sem inventar: `NotFoundError` (404), `ConflictError` (409), `ValidationError`
(422), `AuthorizationError` (403 — cobre `authz.assert_pode_editar_monitoramento`).
`register_exception_handlers` ganha `@app.exception_handler(DomainError)`, mapeando
subclasse→status. Escopo de migração neste bloco: só `app/authz.py` (1 função) e
`app/services/propostas_candidatas.py` (3 ocorrências) — únicos consumidores reais hoje;
`monitoramento.py`/services de monitoramento ficam fora.

**Dados**: nenhum schema de entrada/saída novo — infraestrutura de erro. Resposta final ao cliente
mantém **o mesmo formato atual** `{"error": ..., "detail": None}` — payload HTTP não muda.

**Resiliência**: teste novo `backend/tests/test_errors.py` (não existe hoje) — cada subclasse →
status certo, corpo idêntico ao que `HTTPException` produzia antes. Rodar
`tests/test_propostas_candidatas.py` antes/depois para confirmar paridade de status/corpo.

**Riscos**: baixo — mesmo status, mesmo formato de resposta, só muda a origem da exceção. Risco de
regressão restrito a `authz.py` e `propostas_candidatas.py`.

## Bloco B — Contrato de Repository/Service, documentado (P1)

**Objetivo**: formalizar por escrito o padrão já correto em `propostas_candidatas.py` como convenção
obrigatória — hoje só existe por convenção implícita de um único par de arquivos, e diverge
explicitamente em `monitoramento.py` (commit no Router).

**Arquivos afetados**: `padroes/backend/constituicao_backend.md` (Seção 3), `CLAUDE.md`.

**Estratégia**: só documentação — `propostas_candidatas.py` (repository + service) já é o exemplo
mínimo funcional citável, não duplicar em exemplo sintético. Contrato: Repository = funções soltas,
`db` por parâmetro posicional, nunca `commit()`/`rollback()`; Service = funções soltas, `db` via
keyword-only (`*, db: Session`), único lugar que commita, levanta `DomainError` (Bloco A) nunca
`HTTPException`; Router só monta `Depends`, chama Service, devolve o retorno — nunca `commit()`/
`refresh()` no Router (fecha a divergência de `monitoramento.py` como regra prospectiva, sem migrar
esse arquivo agora).

**Dados**: não aplicável.

**Resiliência**: não aplicável — a validação real do padrão acontece no Bloco C.

**Riscos**: nenhum risco técnico; risco é de adesão (só "pega" se Bloco C seguir à risca e revisões
futuras cobrarem isso).

## Bloco C — Migrar `notificacoes` para Router → Service → Repository (P1, piloto)

**Objetivo**: provar o padrão (Blocos A+B) num fluxo pequeno, isolado, com escrita real
(`marcar_lida`), sem alterar o contrato HTTP hoje consumido pelo frontend.

**Arquivos afetados**: `backend/app/schemas.py` (recebe `NotificacaoRead`/`NotificacoesListRead`,
movidos do router); `backend/app/repositories/notificacoes.py` (novo);
`backend/app/services/notificacoes.py` (novo); `backend/app/routers/notificacoes.py` (fica fino).

**Estratégia**: schemas saem do router para `backend/app/schemas.py`, mesmo shape — decisão: não
criar `schemas/` por feature ainda (achado P1.6 do diagnóstico, reorganização geral, é maior que este
bloco; fica registrado como candidato futuro, não resolvido aqui).
`repositories/notificacoes.py`: `listar_notificacoes_paginadas` (itens/total/não lidas, mesmas 3
queries só movidas), `obter_notificacao`. `services/notificacoes.py`: `listar_notificacoes` (orquestra,
sem commit — é leitura), `marcar_notificacao_lida` (busca via repository, `NotFoundError` se `None`,
seta `lida = True`, `commit()`+`refresh()` dentro do Service). Router perde os imports de SQLAlchemy
e o `HTTPException` direto.

**Dados**: contrato de entrada/saída **não muda** — mesmos query params (`limit`, `offset`,
`apenas_nao_lidas`), mesmo `response_model`, mesmo formato de erro 404 (via `NotFoundError` →
tradutor do Bloco A, byte-a-byte igual ao `HTTPException` atual). Regra de negócio existente
(`nao_lidas` sempre sobre o total, ignorando `apenas_nao_lidas`/paginação) é preservada.

**Resiliência**: `backend/tests/test_service_notificacoes.py` novo (sucesso de
`marcar_notificacao_lida` + `NotFoundError` quando id não existe); teste de contrato de router
existente/ampliado (`tests/test_notificacoes.py`) roda **antes** da migração para fixar baseline de
comportamento e **depois** para confirmar paridade byte-a-byte.

**Riscos**: `notificacoes` é consumida pelo frontend — risco central é quebrar contrato HTTP.
Mitigação: baseline de teste antes/depois, nenhuma rota nova, nenhum campo removido/renomeado.

## Bloco D — Remover os 3 schemas mortos (P2, código morto comprovado)

**Objetivo**: `ErrorResponse`, `UserCreate`, `TokenPayload` (`backend/app/schemas.py`) — zero
consumidor real confirmado por grep em todo o backend (rotas, services, testes).

**Arquivos afetados**: `backend/app/schemas.py`.

**Estratégia**: remover as 3 classes e o comentário associado a `ErrorResponse`; reconfirmar grep no
estado atual antes de remover (não assumir que o achado do diagnóstico ainda vale sem checar de
novo).

**Dados**: não aplicável — schemas sem uso, nenhum contrato de rota afetado.

**Resiliência**: rodar suite completa (`pytest -m "not db"` e `-m db"`) depois da remoção — mesma
contagem de passed que antes.

**Riscos**: mínimo — import quebrado, se houvesse, falharia alto na inicialização do FastAPI, antes
de qualquer teste rodar.

## Bloco E — ruff + mypy com baseline (P2)

**Objetivo**: cobrir "ruff/mypy não instalados, sem config" sem virar refatoração geral do backend.

**Arquivos afetados**: `backend/pyproject.toml`; `.ruff-baseline.json` (ou equivalente) novo,
versionado.

**Estratégia**: `ruff`/`mypy` em `[dependency-groups].dev`. Config mínima: `[tool.ruff]` com
`target-version` alinhado ao `requires-python`, `[tool.ruff.lint]` só `E`/`F`/`I` (erro, pyflakes,
ordem de import — sem regra de estilo agressiva agora); `[tool.mypy]` com `python_version`, sem
`strict` de cara. Baseline **zero erro novo, ignora legado** — gerar na primeira execução; falha só
em achado novo fora da baseline. Arquivos novos dos Blocos A/C (`domain_errors.py`,
`repositories/notificacoes.py`, `services/notificacoes.py`) devem nascer limpos, sem exceção na
baseline.

**Dados**: não aplicável.

**Resiliência**: rodar `ruff check`/`mypy` uma vez para gerar a baseline antes de fechar o bloco.

**Riscos**: baixo tecnicamente; integração em CI é decisão de devops/qualidade — fora deste Plan
Mode, só a config e a baseline ficam resolvidas aqui.

## Ordem de execução recomendada

1. **Bloco A** — pré-requisito de B e C.
2. **Bloco B** — documentação, barato, destrava C com convenção já escrita.
3. **Bloco C** — prova de conceito do padrão; validar com testes de contrato antes de seguir.
4. **Bloco D** — roda a suite de regressão junto da validação de C, evitando rodar 2x por mudanças
   pequenas não relacionadas.
5. **Bloco E** — por último, para a baseline não capturar código que ainda ia mudar neste mesmo
   ciclo, e para A/C já nascerem sem exceção na baseline.

Implementação segue item a item, após aprovação explícita — nenhum código foi alterado nesta
entrega do Plan Mode.

## Execução

Blocos A-E implementados em 2026-09-17, na ordem acima. Detalhe do que mudou em cada arquivo:
`docs/arquitetura/diagnostico-constituicao-backend-2026-09-16.md`, seção "Execução (2026-09-17,
Plan Mode backend)".
