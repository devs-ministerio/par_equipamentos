# Diagnóstico da Constituição Backend — 2026-09-28

## Escopo e método

Leitura de `backend/app`, routers, services, repositories, contratos e CI,
contra a Constituição Backend. Nenhuma rota, migration ou dado foi alterado.

## Evidências

- `uv run ruff check .` passou.
- `uv run pytest` passou com 155 testes e 208 skips por ausência de
  `TEST_DATABASE_URL` nesta sessão; o workflow versionado provisiona Postgres
  efêmero para a execução integral.
- `uv run mypy .` encontrou sete erros, todos nos dois scripts locais não
  rastreados do worktree; não há erro listado em arquivo versionado.
- Sete routers ainda têm acesso direto a `Session`; 38 dos 46 decorators HTTP
  declaram `response_model` explicitamente.

## Avaliação

**Conformidade: 8,2/10.** Validação de fronteira, erros e transações nos
services migrados estão bem encaminhados, mas a separação em camadas ainda não
é regra uniforme.

### P1 — Router → Service → Repository é incompleto

`auth`, `convenios`, `equipment_offer`, `macro_coverage`, `monitoramento`,
`municipality_coverage` e `propostas_candidatas` consultam diretamente o banco
no router. Migrar por caso de uso, preservando contrato HTTP e concentrando
commit/regra no service; não realizar uma reescrita horizontal.

### P1 — oito rotas sem contrato de resposta explícito

O inventário encontrou oito decorators sem `response_model`. Classificar cada
um (health/download/stream versus API JSON) e tipar os JSON públicos antes de
alterar envelope global, que é breaking change.

### P2 — unidades excessivamente concentradas

`services/relatorios.py` (1.018 linhas), `routers/monitoramento.py` (810) e
`services/monitoramento_eventos.py` (741) superam muito o limite recomendado.
Extrair por caso de uso e manter testes de contrato para evitar regressão.

## Próximo Plan Mode

Começar pela migração vertical de um router de maior mutação, incluindo schema,
repository, service, resposta e testes unitário/integração/HTTP.
