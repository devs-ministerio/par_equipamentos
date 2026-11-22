# Plan Mode — Fechamento da Constituição Backend (2026-09-22)

## Objetivo

- Fechar os achados do diagnóstico de 2026-09-22 sem breaking change HTTP.
- Preservar cálculos de cobertura/déficit/distância e a execução mais recente por família.
- Cada bloco só avança após testes, remoção de mortos comprovados e atualização de contexto.

## 1. Gates de qualidade reais

**Status: concluído para o código de aplicação.** Ruff e mypy agora cobrem
`app/`; migrations e scripts operacionais históricos permanecem fora deste
gate e seguem com inventário próprio.

**Progresso complementar:** os três pipelines de produção agora também passam
em lint e tipagem após a tipagem explícita do acumulador de oferta. A revisão
metodológica confirmou que `uso_sus` continua sendo a única oferta usada no
cálculo e `existente` permanece somente informativo.

**Fechamento de tipagem:** `mypy .` passa nos 170 arquivos, incluindo scripts,
testes e migrations. O gate Ruff permanece em `app/`: as migrations históricas
mantêm apenas divergências mecânicas de ordenação de imports e não serão
reformatadas em massa sem uma rodada dedicada de histórico de schema.

- Arquivos: `backend/pyproject.toml`, baselines, script comparador e `backend_ci.yml`.
- Implementar comparador versionado: falha somente para achado novo fora da baseline;
  CI executa Ruff, mypy, pytest e audit pelo mesmo mecanismo.
- Corrigir tipos/lint do `backend/app/` tocado; não aumentar baseline nem reformatar migrations/scripts históricos.
- Aceite: baseline é evidência executável, regressão falha localmente/CI e nenhum erro novo é mascarado.

## 2. Mutações de monitoramento em camadas

**Status: concluído.** Consultas, persistência de instrumentos/eventos/ações/
notificações e o agregado de `/resumo` foram movidos para o repository; erros
HTTP diretos saíram dos services e o commit pertence ao service. O router não
executa query nem controla transação nesse domínio.

- Arquivos: `routers/monitoramento.py`, services de instrumentos/eventos, repository de
  monitoramento, schemas, erros e testes.
- Migrar verticalmente criar/editar instrumento e registrar/editar/excluir evento/ação:
  Repository consulta/muta; Service valida, orquestra e comita; Router só trata HTTP.
- Services levantam `DomainError`, sem FastAPI/SQL; manter status e payload existentes.
- Riscos: autorização, append-only, inauguração e rollback; testar sucesso, conflito, 404 e permissão.
- Aceite: nenhum query/commit no Router nem FastAPI/SQL nos Services migrados; testes unitário,
  repository e HTTP passam no PostgreSQL isolado.

## 3. Contratos de integrações

**Status: concluído com compatibilidade controlada.** As bordas de Portal da Transparência,
TransfereGov, DEMAS, ElastiCNES e SIDRA agora validam a forma do payload e os
campos efetivamente consumidos antes da normalização. Os DTOs preservam campos
adicionais. DEMAS, ElastiCNES, SIDRA, a timeline do monitoramento e o
importador PRONON já consomem DTOs; os jobs TransfereGov que produzem
evidência relacional integral agora persistem em `evidencia_transferegov`:
cada nó tem tipo, chave externa, caminho pai/filho, hash e payload auditável.
O adaptador `metas_resumo` fica somente para os leitores HTTP já publicados;
há backfill idempotente e ele não deve receber novos consumidores.

**Progresso complementar:** o coletor relacional TransfereGov foi tipado sem
reduzir seus campos; a árvore relacional passou a ter schema versionado e o
JSON integral continua restrito à evidência, não às decisões de domínio.

- Arquivos: `portal_transparencia.py`, `transferegov_parcerias.py`, `api_demas.py`,
  `api_elasticnes.py`, `api_sidra.py`, `contratos_externos.py`, DTOs e fixtures
  sanitizadas.
- Criar parse estrito dos campos consumidos; JSONB bruto fica apenas como evidência auditável.
- Mapear timeout, HTTP, payload ausente e schema alterado para erro descritivo; preservar retry/idempotência.
- Aceite: dado crítico não atravessa a borda como `dict[str, Any]` sem parse e recarga não duplica efeito.

## 4. Observabilidade e limpeza

**Status: concluído.** Middleware JSON com correlação/duração,
telemetria mínima das chamadas externas e o contexto morto de reset de senha
foram atualizados. O inventário confirmou que os scripts restantes são
entrypoints de CI, testes, pipelines ou cargas manuais documentadas; nenhum
foi removido sem substituto. A revisão deve ser repetida quando esses fluxos
forem aposentados.

- Arquivos: `main.py`, novo logger/telemetria, clientes HTTP, testes, `CLAUDE.md` e diagnósticos afetados.
- Registrar JSON com `trace_id`, método, path, status e duração; nunca token, CPF ou payload financeiro.
- Remover apenas helper/schema/arquivo sem consumidor e com substituto testado; scripts exigem inventário antes de exclusão.
- Aceite: logs/redaction testados, `ruff`, `mypy`, `pytest`, contratos e `git diff --check` passam;
  diagnóstico e nota são atualizados com pendências externas explícitas.

## Fechamento — 100% do escopo de código

Os quatro blocos foram concluídos sem alterar o contrato HTTP. `ruff check .`
passa por uma lista explícita e fechada de exceções exclusivamente mecânicas
das migrations já aplicadas; migrations novas continuam sem exceção. `mypy .`
cobre todo o backend. A evidência TransfereGov foi formalizada em schema
versionado, com backfill idempotente a executar **somente** no deploy usando
a credencial de migration; o JSON de detalhe continua temporariamente para
compatibilidade dos leitores existentes, não para novos consumidores.

Não há arquivo morto comprovado para remover nesta rodada: o inventário
identificou todos como entrypoints de pipeline, auditoria, CI, teste ou carga
manual controlada. A ausência de exclusão é intencional e documentada.
