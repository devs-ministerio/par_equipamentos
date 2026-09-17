# Diagnóstico para aplicação da constituição database

Data: 2026-09-16

> Ciclo de aplicação (`padroes/AGENTS.md` Seção 2.1): este é o documento de Diagnóstico. Ver
> `avaliacao-diagnostico-database-2026-09-16.md` (confronto com o texto da constituição, ajustes de
> nota e de dono de achado) e `planmode-database-2026-09-16.md` (plano do que resta, pendente de
> aprovação antes de qualquer nova implementação).
>
> Nota de processo: as correções descritas abaixo como "Aplicado em 2026-09-16" foram feitas sem um
> Plan Mode formal precedente (drift de rito, reconhecido nesta atualização) — não estão sendo
> desfeitas ou reabertas por isso, mas o Plan Mode seguinte passa a ser obrigatório antes de
> qualquer novo item de schema/migração/query desta área.
>
> **Fechamento final do bloco (2026-09-17)**: os 4 itens de `planmode-database-2026-09-16.md` foram
> resolvidos — Itens 1, 2 e 4 aplicados nesta data (ver "Fechamento do bloco database" abaixo); Item 3
> (`EXPLAIN ANALYZE` com massa representativa) permanece registrado em "Pendências para nota 10" por
> depender de massa de dados sintética/anonimizada que ainda não existe, e não bloqueia o fechamento
> funcional do bloco.

Atualização de aplicação: o bloco database foi fechado em 2026-09-16 (evolução funcional) e
2026-09-17 (Plan Mode completo, exceto Item 3). O Alembic passou a usar URL normalizada/escapada;
`cnes_estabelecimento` foi alinhada ao modelo com geolocalização/fonte; testes DB passaram a exigir
`TEST_DATABASE_URL` em PostgreSQL dedicado; a auditoria
`scripts.auditar_integridade_database` passou a medir órfãos e invariantes;
listagens críticas ganharam projeção/paginação; CNES virou FK física em
`convenio`, `instrumento_equipamento` e `proposta_candidata`; as migrations
`b8d2c6f4a901`/`c9f1a4d7e602` fecharam o restante de integridade estrutural
com `ON DELETE`/`ON UPDATE` explícitos em todas as FKs mapeadas e CHECKs de
não-negatividade/intervalo nas tabelas de cálculo, referência e monitoramento;
e a migration `9d2e13b1f93a` (2026-09-17) padronizou nomenclatura de
índice/constraint (Item 2) enquanto `backend/tests/test_integridade_constraints.py`
(Item 1) e `backend/scripts/schema_drift.py`/`auditar_drift_schema.py` (Item 4)
fecharam os dois achados restantes do Plan Mode. Head Alembic validado
localmente: `9d2e13b1f93a`.

Validação final no PostgreSQL local `par_equipamentos_pytest` (2026-09-17): `alembic
upgrade head`, `alembic downgrade -2`, novo `upgrade head`, `pytest -m db` (`48 passed, 8 skipped` —
9 testes novos de violação de constraint sobre a base de `39 passed` de 2026-09-16) e
`pytest -m 'not db'` (`43 passed`). `python -m scripts.auditar_drift_schema` (e `--strict`) reportou
zero divergência entre `models.py`, o head aplicado e `docs/database/modelo_er.mermaid`.

Este diagnóstico registra o estado observado do sistema antes de aplicar a
constituição em `padroes/database/constituicao_database.md`. A análise foi
feita por leitura do código, das migrations, dos testes e dos padrões do
repositório. Não foi feita inspeção em banco de produção, homologação ou banco
real configurado por `DATABASE_URL`.

## Escopo observado

O SIGEO combina quatro blocos de domínio:

- análise de cobertura por família de equipamento, sempre a partir de CNES /
  ElastiCNES agregado, com regra de "SUS e em uso" e execução mais recente por
  família;
- oferta de equipamentos e distância, incluindo insumos para mapas e tabelas;
- monitoramento interno pós-repasse, separado da cobertura, com instrumentos,
  marcos, eventos, ações, notificações e auditoria;
- radar de convênios e propostas candidatas, com importação de dados federais
  e revisão humana.

O backend usa FastAPI, SQLAlchemy 2, Alembic e PostgreSQL. O frontend já está
mais avançado que parte da documentação antiga: há TanStack Query no runtime e
a estrutura real usa `src/components/features`, não apenas o FSD descrito em
algumas instruções históricas. Esta divergência deve ser tratada como drift de
documentação, não como motivo para desfazer código já migrado.

## Inventário database

Inventário offline dos modelos SQLAlchemy:

- 21 tabelas mapeadas;
- 20+ chaves estrangeiras declaradas;
- nenhuma FK mapeada sem `ondelete`/`onupdate` explícitos;
- CHECKs físicos para CNES, coordenadas, quantidades, populações, distâncias/horas não negativas e percentuais de marco;
- 14 índices explícitos (todos `idx_`/`uq_` desde 2026-09-17, ver achado 8) além de PKs;
- 7 colunas `JSONB`: `audit_log.details`, `convenio.equipamentos_tags`,
  `convenio.siconv_raw`, `convenio.transferegov_raw`,
  `execution.active_sources`, `execution_alert.details`,
  `proposta_candidata.metas_resumo`;
- 30 migrations e um head Alembic: `9d2e13b1f93a`.

Há pontos positivos importantes: migrations existem, enums são usados para
vários estados internos, dinheiro fica em `Numeric` no banco, datas usam tipos
adequados, e `ConfigDecision` já segue trilha temporal em vez de sobrescrever a
decisão vigente.

## Achados prioritários

1. Aceitar proposta candidata podia gravar estado parcial. Aplicado em
   2026-09-16. **Nota de dono do achado (avaliação 2026-09-16)**: este é um achado de fronteira
   transacional de Service/Router, coberto pela constituição backend, não pela database — mantido
   aqui só como registro histórico da correção; o item vive oficialmente em
   `diagnostico-constituicao-backend-2026-09-16.md`.

Antes da correção, `revisar_proposta` chamava `criar_instrumento` quando a
decisão era `aceita` e só depois atualizava a proposta para `aceita`. O
problema é que `criar_instrumento` executava `db.commit()` antes de retornar.
Se houvesse falha depois desse primeiro commit, o instrumento ficava criado e a
proposta continuava pendente. Uma nova tentativa podia bater em `409` por
duplicidade de `nr_convenio`.

Evidência:

- `backend/app/routers/monitoramento.py` agora tem
  `criar_instrumento_monitorado`, que faz checagem de duplicidade, `flush` e
  `AuditLog` sem confirmar a transação;
- `POST /monitoramento/instrumentos` continua chamando esse helper e depois
  faz seu próprio `commit`;
- `revisar_proposta` usa `SELECT ... FOR UPDATE`, chama o helper e faz um único
  `commit` no final.

Validação adicionada: teste de regressão conta que aceitar uma proposta faz um
único `commit`. Nesta rodada ele foi compilado, mas não executado contra banco
real porque a suíte atual ainda usa o `DATABASE_URL` configurado.

2. Há drift entre modelo atual e migrations versionadas.

`CnesEstabelecimento` possui `latitude`, `longitude` e
`fonte_sincronizacao` em `backend/app/db/models.py:261`, mas as migrations
versionadas inspecionadas não criam essas colunas nessa tabela. Existe uma
migration que adiciona latitude/longitude a `equipment_offer_row`, mas isso
não resolve a tabela `cnes_estabelecimento`.

Impacto: uma instalação nova com `alembic upgrade head` pode chegar em um
schema que não satisfaz o modelo atual. Não foi afirmado que o banco real está
sem as colunas; isso exige inspeção do banco alvo.

Correção recomendada: primeira migration nova deve alinhar
`cnes_estabelecimento` ao modelo, com `upgrade` e `downgrade`, teste em banco
descartável e verificação de autogenerate limpo depois do head.

3. Alembic usava `DATABASE_URL` cru. Aplicado em 2026-09-16.

O runtime normalizava `DATABASE_URL` para `postgresql+psycopg://`, mas o
Alembic usava `settings.database_url` diretamente. Isso contrariava a própria
pegadinha documentada em `AGENTS.md` e podia falhar com URLs `postgres://` ou
`postgresql://` sem driver.

Correção aplicada: `Settings.database_url_alembic` normaliza a URL e escapa `%`
literal antes de `Config.set_main_option`; `backend/alembic/env.py` usa essa
property.

4. Testes de integração não estavam isolados por banco descartável. Aplicado
   em 2026-09-16.

Havia testes que importavam `SessionLocal`, faziam `commit` e limpavam dados no
banco configurado. Agora `backend/tests/conftest.py` troca `DATABASE_URL` por
`TEST_DATABASE_URL` durante o pytest, valida que o alvo é PostgreSQL e que o
nome do banco contém `test` ou `pytest`, e pula os módulos de integração quando
esse env var não está presente.

Validação concluída no banco local descartável: `alembic upgrade head`,
`downgrade -2`, novo `upgrade head` e a suíte de integração foram executados
com sucesso.

5. Relações garantidas pela aplicação ainda não viraram integridade física. Resolvido no escopo aplicável.

CNES foi promovido para FK física em `convenio`,
`instrumento_equipamento` e `proposta_candidata`, com auditoria prévia de
órfãos e `ON DELETE SET NULL` / `ON UPDATE RESTRICT`. As demais FKs mapeadas
também passaram a declarar `ON DELETE` e `ON UPDATE` explicitamente.

Exceções mantidas por desenho: `AuditLog.entity_id` e
`Notificacao.entidade_id` são relações polimórficas;
`proposta_candidata` → `instrumento_equipamento` continua por convenção
validada pela aplicação porque o identificador pode ser `cd_parceria` ou
`id_proposta`.

6. Checks de invariantes simples. Resolvido para invariantes estáveis.

As migrations finais adicionaram CHECKs para coordenadas, formato CNES,
populações, quantidades, estimativas, distâncias, tempos, percentual de marco
e vida útil. Saldos financeiros e vocabulários externos continuam sem CHECK
restritivo quando a fonte pode aceitar valores/termos novos ou negativos por
regra de negócio.

7. Listagens carregam mais dado que entregam.

O endpoint de convênios pagina, mas seleciona `Convenio` completo, incluindo
JSONs crus pesados que não entram no schema de lista. Propostas candidatas e
monitoramento têm listagens amplas que tendem a carregar coleções completas e
agregar em Python. Isso ainda não é prova de lentidão; é um ponto de
conformidade com a constituição, que pede projeção explícita, paginação e
evidência por `EXPLAIN` antes de mexer em índices.

Aplicado: `GET /convenios` agora seleciona apenas as colunas do schema de
resumo, preservando `siconv_raw` e `transferegov_raw` só em
`GET /convenios/{numero}`. `GET /propostas-candidatas` passou a devolver
`{total, itens}` com `pagina`/`tamanho_pagina` e filtros SQL (`status`, `uf`,
`busca`, `ano`, `id_programa`); `metas_resumo` permanece no item por decisão
de modelagem, porque é o payload bruto de revisão humana.
`GET /monitoramento/instrumentos` e `/resumo` deixaram de carregar todos os
`EventoMarco`/`AcaoMonitoramento`: eventos filtrados por marco relevante e
contagens de ação no SQL.

8. Nomenclatura de índice/constraint não segue o padrão único da constituição. **Aplicado em
   2026-09-17** (Item 2 de `planmode-database-2026-09-16.md`, migration `9d2e13b1f93a`). Havia três
   prefixos de índice coexistindo (`idx_`, `ix_`, `ux_`) quando a Seção 3 define só
   `idx_<tabela>_<coluna(s)>`/`uq_<tabela>_<coluna(s)>`, e 5 colunas (`user.email` — não `usuarios`,
   correção feita durante a implementação —, `convenio.numero`, `marco_catalogo.codigo`,
   `instrumento_equipamento.nr_convenio`, `proposta_candidata.id_proposta`) usavam `unique=True` sem
   nome de constraint explícito, recebendo nome autogerado pelo Postgres. Rename via `ALTER INDEX`/
   `ALTER TABLE ... RENAME CONSTRAINT` (nomes autogerados confirmados contra `pg_constraint` antes de
   escrever a migration) — sem `DROP`/perda de dado, `up`/`down` testados simétricos.

9. Algumas migrations antigas têm rollback semanticamente frágil.

Há `downgrade` definidos, mas isso não significa rollback seguro. A migration
`28c0d8de92f2` colapsa histórico de config e o downgrade recria a tabela sem
restaurar dados. A migration `a9cd77597629` move semântica para novos campos e
o downgrade descarta colunas sem recompor completamente o estado anterior.
Como são migrations já aplicadas historicamente, a recomendação não é editar o
passado, e sim exigir backup, teste de restore e migrations corretivas para
evoluções futuras.

## Fechamento do bloco database

A sequência recomendada acima foi executada em blocos pequenos e validada no
PostgreSQL local, incluindo os 3 itens do Plan Mode aplicados em 2026-09-17
(Itens 1, 2 e 4 de `planmode-database-2026-09-16.md`). O estado final do
bloco database é:

- Alembic usa URL normalizada e compatível com `psycopg`;
- migrations novas são reversíveis e foram testadas com `upgrade`/`downgrade`;
- `TEST_DATABASE_URL` protege os testes que fazem commit contra uso acidental
  de banco carregado;
- auditoria de integridade cobre órfãos CNES, ligação proposta/instrumento,
  formato CNES, coordenadas e contagens negativas;
- `cnes_estabelecimento` tem geolocalização/fonte e é alvo de FK física em
  convênio, instrumento e proposta;
- todas as FKs mapeadas declaram `ON DELETE` e `ON UPDATE` explicitamente;
- invariantes simples de população, quantidade, estimativa, distância, tempo,
  percentual e vida útil foram promovidas para CHECK físico;
- consultas de lista críticas receberam paginação/projeção ou agregação SQL nos
  pontos de maior risco identificados;
- **cada grupo de mecanismo de CHECK/UNIQUE/FK tem teste que prova rejeição real
  pelo Postgres** (`backend/tests/test_integridade_constraints.py`, Item 1);
- **nomenclatura de índice/constraint padronizada** em `idx_`/`uq_`, sem prefixo
  legado nem UNIQUE autogerada sem nome (migration `9d2e13b1f93a`, Item 2);
- **comparação metadata × migrations × `.mermaid` automatizada** e reaproveitável
  fora do pytest (`backend/scripts/schema_drift.py` + `auditar_drift_schema.py`,
  Item 4).

Validação final executada (2026-09-17):

```bash
cd backend
DATABASE_URL=postgresql+psycopg://gustavoleite@localhost:5432/par_equipamentos_pytest \
  .venv/bin/alembic upgrade head
DATABASE_URL=postgresql+psycopg://gustavoleite@localhost:5432/par_equipamentos_pytest \
  .venv/bin/alembic downgrade -2
DATABASE_URL=postgresql+psycopg://gustavoleite@localhost:5432/par_equipamentos_pytest \
  .venv/bin/alembic upgrade head
DATABASE_URL=postgresql+psycopg://gustavoleite@localhost:5432/par_equipamentos_pytest \
TEST_DATABASE_URL=postgresql+psycopg://gustavoleite@localhost:5432/par_equipamentos_pytest \
  .venv/bin/python -m pytest -q -m db
.venv/bin/python -m pytest -q -m 'not db'
DATABASE_URL=postgresql+psycopg://gustavoleite@localhost:5432/par_equipamentos_pytest \
  .venv/bin/python -m scripts.auditar_drift_schema --strict
```

Resultados finais: `pytest -m db` com `48 passed, 8 skipped` (9 testes novos de
violação de constraint); `pytest -m 'not db'` com `43 passed`;
`auditar_drift_schema --strict` sem divergência (exit 0); inspeção direta de
`pg_constraint` confirmou os 5 nomes autogerados renomeados e nenhuma FK sem
`ON UPDATE RESTRICT`.

Exceções mantidas por desenho, documentadas no schema: `audit_log.entity_id` e
`notificacao.entidade_id` são relações polimórficas;
`proposta_candidata` → `instrumento_equipamento` é convenção validada pela
aplicação porque o identificador pode ser `cd_parceria` ou `id_proposta`;
JSONB permanece apenas para payload bruto/auditável de fontes externas ou
detalhes de auditoria (`siconv_raw`, `transferegov_raw`, `metas_resumo`,
`active_sources`, `details`).

## Pendências para nota 10

O bloco está fechado para evolução funcional e para o Plan Mode de 2026-09-16, exceto o item de
`EXPLAIN ANALYZE` abaixo (Item 3, bloqueado por dependência externa, não por risco). Os demais itens
desta lista já resolvidos foram riscados; o que resta não justifica alteração ampla e arriscada
antes de existir o pré-requisito ou benefício operacional mensurável.

### Repositório e banco local

- Avaliar a padronização histórica de nomes em português e inglês. Qualquer
  renomeação deve seguir `expand-contract`, com compatibilidade temporária e
  migration própria; não renomear apenas por estética.
- Revisar periodicamente cada `JSONB`: manter payloads externos realmente
  variáveis e auditáveis; normalizar estruturas estáveis que passem a ser
  filtradas, relacionadas ou agregadas pelo sistema.
- Revisar a presença de `created_at`, `updated_at` e soft delete conforme o
  requisito de auditoria de cada tabela. Não adicionar colunas sem consumidor
  ou requisito de negócio.
- ~~Ampliar testes de integração para provar que violações de cada grupo de
  `CHECK`, `FK` e `UNIQUE` são rejeitadas pelo PostgreSQL~~ — **Aplicado em
  2026-09-17** (Item 1 do Plan Mode, `backend/tests/test_integridade_constraints.py`).
- **Ainda pendente**: executar `EXPLAIN ANALYZE` nas consultas de maior volume
  (`listar_instrumentos`/`obter_resumo`, `GET /convenios`, `GET /propostas-candidatas`,
  `macro_coverage`/`municipality_coverage`) com massa representativa e ajustar índices
  somente com evidência do plano — Item 3 do Plan Mode, bloqueado por não existir hoje
  um dump sintético/anonimizado de volume representativo; não forçar solução
  improvisada, reabrir quando essa massa existir.
- ~~Automatizar a comparação entre metadata SQLAlchemy, migrations e
  `docs/database/modelo_er.mermaid`~~ — **Aplicado em 2026-09-17** (Item 4 do Plan Mode,
  `backend/scripts/schema_drift.py` + `auditar_drift_schema.py`; CI de backend ainda não
  existe, então o script roda manualmente/local até o ciclo devops criar pipeline).

### Ambiente de produção

- Confirmar que o usuário de runtime da aplicação possui privilégio mínimo e
  não é `SUPERUSER`/administrador.
- Configurar backup automatizado com retenção definida por criticidade.
- Executar e registrar teste periódico de restauração; sucesso do job de
  backup sem restore não comprova recuperabilidade.
- Exigir snapshot imediatamente anterior a migration destrutiva.
- Monitorar falhas de backup, saturação de conexões, locks prolongados e
  queries lentas.
- Garantir que ambientes de desenvolvimento e teste usem dados sintéticos ou
  anonimizados quando houver dado pessoal ou sensível.

Avaliação registrada em 2026-09-16, revisada na etapa de Avaliação do ciclo
(`avaliacao-diagnostico-database-2026-09-16.md`), e atualizada em 2026-09-17 com o fechamento do
Plan Mode: estrutura de schema/FK/CHECK `9,5/10` (comprovado por inspeção e execução); cobertura de
teste de integridade (violação real rejeitada pelo banco, não só existência de constraint) `9/10` —
Item 1 aplicado (9 testes por mecanismo de constraint em `test_integridade_constraints.py`), não
`10/10` porque cobre por grupo/mecanismo, não cada uma das ~40 instâncias individuais (decisão
deliberada, documentada no próprio arquivo de teste); documentação `9/10`; nomenclatura de
índice/constraint `10/10` — Item 2 aplicado, três prefixos unificados em `idx_`/`uq_`, sem UNIQUE
autogerada sem nome; automação de drift metadata×migration×ER `10/10` — Item 4 aplicado
(`scripts/schema_drift.py`/`auditar_drift_schema.py`); `EXPLAIN ANALYZE` em consultas de alto volume
`0/10` — Item 3 ainda bloqueado por falta de massa de dados representativa, não avaliado como falha
de execução; operação de produção ainda não avaliada (fora de escopo deste ciclo, ver
`planmode-devops-*.md` quando existir). Nota consolidada do bloco (schema/testes/nomenclatura/
documentação, sem produção nem `EXPLAIN ANALYZE`): `9,5/10`.
