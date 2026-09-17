# Plan Mode — database (2026-09-16)

Terceira etapa do ciclo (`padroes/AGENTS.md` Seção 2.1) para a área database, depois de
`diagnostico-constituicao-database-2026-09-16.md` e
`avaliacao-diagnostico-database-2026-09-16.md`. Formato conforme
`padroes/database/constituicao_database.md` Seção 2. Cobre só o que resta em aberto — os 7
achados já aplicados em 2026-09-16 (commit único, `cnes_estabelecimento`, URL do Alembic,
`TEST_DATABASE_URL`, FK física de CNES, CHECKs, projeção/paginação) não são reabertos aqui; ficam
registrados no diagnóstico como drift histórico (correção sem Plan Mode formal precedente).

Escopo de produção (backup/restore, privilégio mínimo, monitoramento) fica fora deste plano —
pertence ao ciclo devops (`planmode-devops-*.md`, ainda não iniciado).

## Item 1 — Teste de violação real para FK/CHECK/UNIQUE (Aplicado em 2026-09-17)

`backend/tests/test_integridade_constraints.py` (9 testes, `@pytest.mark.db`), registrado em
`_DB_TEST_MODULES` (`backend/tests/conftest.py`). Validado: `pytest -m db` (48 passed, 8 skipped,
mesma base de antes + 9 novos) e `pytest -m 'not db'` (43 passed) sem regressão.


**Objetivo**: fechar a exigência da Seção 9 da constituição ("constraint coberta por teste que
confirma que a violação é rejeitada pelo banco, não só pela aplicação"), hoje ausente. Motivo:
apontado como pendência pelo próprio diagnóstico e é o único item que impede fechar "cobertura de
teste de integridade" com nota alta.

**Modelagem**: nenhuma mudança de schema. Cobre os grupos já existentes — CHECKs de
não-negatividade/formato/intervalo (ex.: `ck_cnes_estabelecimento_cnes_formato`), FKs físicas de
CNES (`convenio`, `instrumento_equipamento`, `proposta_candidata`) e a UNIQUE de `nr_convenio`/
`email`/`numero`/`codigo`/`id_proposta`.

**Migração**: nenhuma. Só `backend/tests/test_integridade_constraints.py` novo, marcado `@pytest.mark.db`,
tentando inserir/atualizar valor inválido e afirmando `IntegrityError`/`DataError`.

**Performance**: nenhum impacto (roda contra banco descartável de teste).

**Riscos**: nenhum — leitura/escrita isolada em `TEST_DATABASE_URL`.

## Item 2 — Padronizar nomenclatura de índice/constraint (Aplicado em 2026-09-17)

Migration `9d2e13b1f93a` (rename de 13 `ix_`→`idx_`, 1 `ux_`→`uq_`, e 5 `UniqueConstraint`
nomeadas via `ALTER TABLE ... RENAME CONSTRAINT`, nomes autogerados confirmados via `pg_constraint`
antes de escrever a migration). `backend/app/db/models.py` atualizado nos mesmos 19 pontos.
Validado: `alembic upgrade head` / `downgrade -1` / `upgrade head` simétrico,
`pytest tests/test_schema_migrations.py -m db` (metadata bate com banco pós-rename).


**Objetivo**: a Seção 3 da constituição define `idx_<tabela>_<coluna(s)>` para índice e
`uq_<tabela>_<coluna(s)>` para unique. O inventário real tem três prefixos de índice coexistindo
(`idx_`, `ix_`, `ux_`) e 5 colunas com `unique=True` sem nome explícito (nome autogerado tipo
`usuarios_email_key`). Achado novo desta rodada de avaliação, não estava no diagnóstico original.

**Modelagem**: nenhuma entidade/coluna muda — só o nome físico de 13 índices `ix_*`→`idx_*`, 1
`ux_config_decision_key_vigente`→`uq_config_decision_key_vigente`, e nomeação explícita das 5
UNIQUE hoje implícitas (`usuarios.email`, `convenio.numero`, `marco_catalogo.codigo`,
`instrumento_equipamento.nr_convenio`, `proposta_candidata.id_proposta`).

**Migração**: uma migration aditiva de só `RENAME`/`ADD CONSTRAINT ... UNIQUE` nomeada — sem
`DROP`/recriação de dado, `down` faz o rename inverso. Checar antes se algum código
(scripts de auditoria, `ON CONFLICT` nomeado) referencia o nome físico atual antes de renomear.

**Performance**: nenhuma — rename de índice não reconstrói o índice no Postgres.

**Riscos**: baixo. Lock breve de metadata (`ALTER INDEX RENAME`/`ALTER TABLE RENAME CONSTRAINT`),
sem reescrita de tabela. Só quebra algo se um consumidor externo referenciar o nome físico da
constraint diretamente (não esperado; validar com grep antes de aplicar).

## Item 3 — `EXPLAIN ANALYZE` nas consultas de maior volume

**Objetivo**: constituição (Seção 8, "Sempre") exige `EXPLAIN ANALYZE` antes de considerar query de
alto volume pronta; hoje nenhuma consulta do SIGEO tem essa evidência registrada.

**Escopo de queries**: `listar_instrumentos`/`obter_resumo` (monitoramento), `GET /convenios` e
`GET /propostas-candidatas` já projetados/paginados, `macro_coverage`/`municipality_coverage` sem
paginação (achado do diagnóstico backend, dependência cruzada).

**Migração**: nenhuma até haver evidência. Se `EXPLAIN` apontar sequential scan em coluna de filtro
frequente, abre um Plan Mode específico de índice (novo documento, não misturado a este).

**Performance**: só leitura via `EXPLAIN ANALYZE` contra banco com massa representativa (dump
sintético/anonimizado, nunca produção direto).

**Riscos**: nenhum se rodar fora de produção; nunca rodar `EXPLAIN ANALYZE` (que executa de verdade)
em query de escrita ou em produção sob carga.

## Item 4 — Automatizar comparação metadata × migrations × ER (Aplicado em 2026-09-17)

Achado durante a execução: a comparação já existia em `backend/tests/test_schema_migrations.py`
(`compare_metadata` + `ScriptDirectory`) — extraída para `backend/scripts/schema_drift.py` (módulo
puro, sem assert/print), reaproveitado pelo teste (inalterado em comportamento) e por
`backend/scripts/auditar_drift_schema.py` (CLI de relatório, `exit(0)` por padrão, `--strict` para
uso futuro em CI; bloco best-effort de comparação com `docs/database/modelo_er.mermaid`, sempre
informativo). CI de backend não existe hoje — fica registrado como próximo passo do ciclo devops.


**Objetivo**: constituição pede schema previsível; hoje a conferência de 21/21 tabelas e 23/23 FKs
no diagrama foi manual (registrada em 2026-09-16), sem repetição automática.

**Modelagem/Migração**: nenhuma mudança de schema — script novo
(`backend/scripts/auditar_drift_schema.py` ou extensão de `auditar_integridade_database.py`) que
compara `Base.metadata` com o head do Alembic e opcionalmente com `docs/database/modelo_er.mermaid`.

**Performance**: nenhuma.

**Riscos**: nenhum. Rodar em CI, não bloqueia deploy inicialmente (relatório, não gate) até
estabilizar.

## Decisões registradas sem migração nesta rodada

- **JSONB**: revisão mantém as 7 colunas como estão — todas são payload externo/auditável
  (`siconv_raw`, `transferegov_raw`, `metas_resumo`, `active_sources`, `details`,
  `equipamentos_tags`). Nenhuma virou candidata a normalização por falta de consumo por
  filtro/relação estruturado hoje. Reabrir só quando um consumidor concreto precisar filtrar/
  relacionar um desses campos.
- **Nomenclatura PT/EN de tabela**: mantida como está — qualquer troca segue expand-contract
  completo (não é este plano) e só se justifica por confusão real relatada, não estética.
- **`created_at`/`updated_at`/soft delete**: nenhuma tabela identificada com requisito de auditoria
  pendente sem essas colunas nesta leitura; não adicionar coluna sem consumidor.

## Ordem de execução recomendada

1. Item 1 (teste de violação) — maior valor, zero risco, fecha o gap mais citado pela constituição.
2. Item 2 (nomenclatura) — baixo risco, mas exige o grep de verificação antes de qualquer rename.
3. Item 4 (automação de drift) — evita a próxima rodada de diagnóstico repetir trabalho manual.
4. Item 3 (`EXPLAIN ANALYZE`) — depende de massa representativa; pode rodar em paralelo aos demais.

Implementação começa item a item, só após aprovação explícita deste Plan Mode, por
`padroes/AGENTS.md` Seção 2.1.
