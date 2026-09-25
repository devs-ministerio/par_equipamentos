# Diagnóstico sênior — Constituição de Database (rodada 2, 2026-09-21 — atualizado em 2026-09-24)

## Objetivo e fluxo da rodada

Esta é a segunda rodada de diagnósticos da constituição, posterior à realizada
entre 16 e 19 de setembro. A sequência acordada permanece:

`Database → Segurança → Backend → Frontend → DevOps → Qualidade`.

Qualidade fica por último e só começa após os ajustes e melhorias que os cinco
diagnósticos anteriores determinarem. Em cada etapa, além das regras da sua
constituição, a revisão deve obrigatoriamente:

1. identificar código, schema, scripts, índices, documentos e comentários
   mortos;
2. só remover item morto depois de provar que não há leitor, dependência,
   dado histórico ou necessidade de rollback;
3. atualizar os arquivos de contexto que descrevem estado já superado; e
4. registrar tanto o que foi removido quanto o que ainda precisa de uma
   migração/reconciliação antes de poder ser removido.

Para Database, a ingestão é um subdomínio obrigatório da auditoria: fonte,
identidade de upsert, transação, idempotência, rejeições e reconciliação devem
ser revisitados junto do schema. O diagnóstico dedicado de ingestão será
reexecutado após este fechamento, antes de tratar qualquer item como morto.

## Escopo, baseline e método

Foram comparados a Constituição de Database, o diagnóstico de
2026-09-16 (inclusive suas atualizações de 17 e 20/09), `models.py`, todas as
migrations Alembic, scripts de auditoria/ingestão, testes e os metadados do
PostgreSQL configurado. As consultas ao banco foram somente de leitura.

- Head único do histórico Alembic: `c4d6e8f0a123`.
- Banco operacional consultado no mesmo head dos arquivos:
  `c4d6e8f0a123`.
- Inventário físico: 26 tabelas, 26 PKs, 36 FKs, 42 CHECKs, 14 UNIQUEs e
  nenhum índice inválido.
- Auditoria de integridade de negócio: 0 órfãos CNES, 0 propostas aceitas sem
  instrumento, 0 instrumentos TransfereGov sem proposta correspondente, 0
  CNES inválidos, 0 coordenadas inválidas e 0 contagens negativas.
- A coleta diagnóstica inicial foi somente leitura; os ajustes aprovados foram
  executados depois, com backup e validação registrados abaixo.

## Resultado executivo

O banco aplicado preserva as garantias físicas e de integridade verificadas na
primeira rodada, e as migrations têm uma única ponta e `upgrade()`/
`downgrade()`. O drift de metadata foi eliminado e comprovado tanto em
PostgreSQL dedicado no OrbStack como no banco operacional após o deploy.

O contexto do modelo ER agora descreve as três entidades de marcadores. O
legado `equipamentos_tags` continua em observação por expand-contract: não há
pendências na auditoria, nem novos escritores, mas a remoção física permanece
uma decisão destrutiva separada.

## Achados

### Atualização de execução — 2026-09-21

Os três índices únicos parciais foram declarados na metadata de
`EquipamentoMarcador`. A revision `c4d6e8f0a123` explicitou `ON DELETE
RESTRICT` em `evento_marco.fase_geral_id`.

O gate foi concluído: PostgreSQL dedicado `sigeo_constitution_test` foi
provisionado no OrbStack, a migration passou por `upgrade → downgrade →
upgrade`, `pytest -m db` aprovou 87 testes (8 pulados) e o auditor strict não
encontrou diferenças. Após backup pontual confirmado, a mesma revision foi
aplicada no banco operacional e o auditor pós-deploy também retornou limpo.

### P1 — metadata não representava três índices únicos parciais — resolvido

`f4c7e1d9a820_centraliza_marcadores_equipamentos.py` criou os índices únicos
parciais abaixo, todos presentes e válidos no banco:

- `uq_equipamento_marcador_convenio`;
- `uq_equipamento_marcador_proposta`;
- `uq_equipamento_marcador_instrumento`.

Eles garantem unicidade de `(origem, equipamento_catalogo_id,
chave_evidencia)` apenas quando a respectiva FK de origem não é nula. A classe
`EquipamentoMarcador` declara somente os índices de leitura; não declara essas
três constraints em `__table_args__`. Assim, `auditar_drift_schema --strict`
propõe removê-las e `test_schema_migrations.py` falharia em uma base que o
execute de fato.

**Evidência de fechamento:** os três `Index(..., unique=True,
postgresql_where=...)` foram declarados com os predicados físicos existentes;
o diff strict está vazio no banco de teste e no operacional. Não houve
recriação desnecessária dos índices existentes.

### P1 — contrato de FK de `evento_marco.fase_geral_id` não estava alinhado — resolvido

O model declara `ON DELETE RESTRICT` e `ON UPDATE RESTRICT`. A migration
`e39d87b25964` criou a FK só com `ON UPDATE RESTRICT`; a definição física
atual confirma ausência de `ON DELETE` explícito. Embora o comportamento
efetivo padrão seja restritivo, a Constituição exige a ação explícita e a
metadata não pode divergir do contrato aplicado.

**Evidência de fechamento:** migration aditiva e reversível
`c4d6e8f0a123` recriou exclusivamente essa FK com os dois verbos explícitos.
O `downgrade` e a reaplicação foram validados em PostgreSQL descartável antes
do deploy respaldado.

### P2 — modelo ER declarava cobertura total, mas omitia o catálogo de marcadores — corrigido nesta revisão

`docs/database/modelo_er.md` diz que o Mermaid cobre todas as tabelas e FKs,
mas `modelo_er.mermaid` não contém `equipamento_catalogo`, `equipamento_alias`
nem `equipamento_marcador`, embora já existam no schema e sejam a fonte de
verdade do filtro de equipamentos. O diagnóstico de 20/09 também não registra
esta discrepância após a migration.

**Correção aplicada:** Mermaid e texto explicativo agora incluem as três
tabelas, suas FKs, o CHECK de uma origem, aliases e os índices únicos parciais.
A conferência automática posterior contra `models.py` também está limpa.

### P1 — gate de banco não era exercitado nesta máquina com base dedicada — resolvido

Os testes de constraint, FK e drift são corretamente protegidos por
`TEST_DATABASE_URL`; sem essa variável, a execução coletou 16 testes, com 3
passando e 13 pulados. Isso evita tocar na base operacional, mas não substitui
a evidência de migration up/down e diff vazio em PostgreSQL dedicado.

**Evidência de fechamento:** `TEST_DATABASE_URL` apontou exclusivamente para
o PostgreSQL do OrbStack com nome seguro. Foram executados migrations do zero,
ida–volta–ida, `pytest -m db` e o auditor strict. Transformar essa sequência
manual em gate de CI continua como melhoria de DevOps, não como bloqueio do
Database atual.

### P2 — legado de tags é candidato a limpeza, ainda não item morto

O backfill de 20/09 materializou 1.415 evidências centralizadas e preservou
`convenio.equipamentos_tags` apenas por compatibilidade. A auditoria de
21/09 encontrou zero tags sem evidência centralizada; os importadores e
backfills deixaram de escrever o campo.

**Encaminhamento:** manter a coluna só para observação por uma janela de
reexecução das cargas; depois criar migration expand-contract em entrega
separada para removê-la junto do auditor de compatibilidade.

### Auditoria de tabelas vazias — 2026-09-24

Rodada adicional, motivada por achado manual do usuário ao inspecionar o
banco operacional. Contagem de linhas de todas as 27 tabelas do schema
público (`sigeo_runtime`, somente leitura) cruzada com `models.py`,
migrations, `fluxo_requisicao.mermaid` e `modelo_er.mermaid`. Cinco tabelas
estão com 0 linhas; nenhuma é código morto sem dono, mas caem em três
situações distintas que não devem ser tratadas da mesma forma:

**Candidata real a legado — `equipamento_alias`.** Criada na migration
`f4c7e1d9a820` (Plan Mode centralização de marcadores, 2026-09-20), junto de
`equipamento_catalogo` (146 linhas) e `equipamento_marcador` (1.372 linhas,
com serviço ativo em `app/services/equipamento_marcadores.py`).
`equipamento_alias` não tem nenhum escritor nem leitor em todo o repositório
— nem router, nem service, nem script — fora da própria declaração do model
e da migration que a criou. O único uso de "alias" encontrado no código é
`sqlalchemy.orm.aliased` em `app/routers/convenios.py`, sem relação alguma
com esta tabela. O plano original previa "catálogo com nome canônico e
aliases", mas a normalização de nome acabou implementada por outro caminho
(`classificar_descricoes`), sem nunca chegar a usar esta tabela. Diferente de
`equipamentos_tags`, não está registrada em nenhum diagnóstico anterior como
"em observação" — é candidata legítima a `DROP TABLE` (mudança destrutiva,
exige plano aprovado e backup conforme Seção 4 da Constituição), não
expand-contract.

**Dead-by-design, documentado — `execution_alert`.** O docstring de
`app/pipeline/runner.py` explica por que a tabela nunca é escrita:
`ExecutionAlert.execution_id` é `NOT NULL`, mas as etapas mais propensas a
falhar (`api_demas`/`api_sidra`/`api_elasticnes`) rodam antes da `Execution`
existir — o alerta vai para `AuditLog` (que aceita `entity_id` opcional) em
vez disso. É uma tabela definida no schema e contornada de propósito, com
justificativa explícita no código, mas sem consumidor real. Antes de propor
`DROP TABLE`, confirmar com a equipe se `AuditLog` cobre o caso
permanentemente ou se a tabela ainda tem uso futuro planejado.

**Não é legado — dado de referência "congelado", só nunca carregado —
`inca_estimate` e `accelerator_row`.** `AGENTS.md`/`CLAUDE.md` já classifica
as duas como categoria "Congelado" na estratégia de ingestão do Neon:
estatística oficial ANS/INCA e levantamento de Acelerador Linear, sem API
viva, carregada de `data/raw/` só por decisão explícita da equipe ao chegar
arquivo oficial mais novo. Os importadores (`importar_inca_estimates.py`,
`importar_aceleradores.py`) existem desde 2026-08-21 e nunca foram
executados contra o operacional — `backend/data/raw/` nem existe hoje no
repositório, ou seja, a fonte em si nunca chegou a ser versionada. Consistente
com a limitação já registrada de que a produtividade de Acelerador Linear
continua placeholder. Não é código morto — é feature esperando decisão de
produto/fonte de dado, parada há mais de um mês, sem relação com o legado de
tags/marcadores.

**Não é legado — feature nova, ainda sem primeira execução —
`evidencia_transferegov`.** Tem escritor ativo
(`registrar_evidencias_relacionais`, em `app/services/evidencias_transferegov.py`,
chamado por `scripts/job_descoberta_transferegov.py` nos ramos de INSERT e de
UPDATE de proposta). A migration `b7e3d9f4a621` é o head atual do Alembic,
aplicada no commit de 2026-09-23 (véspera desta auditoria). Por
`fluxo_requisicao.mermaid`, o job só roda via `workflow_dispatch` manual — o
cron está comentado/inativo e o workflow pode nem existir na branch padrão do
GitHub. A tabela está vazia porque o job não rodou desde que a feature
nasceu, não porque está morta.

**Achado correlato, não é tabela vazia:** `convenio.equipamentos_tags`
(coluna `jsonb`) segue com 560/560 convênios preenchidos — confirma que a
compatibilidade temporária descrita no achado anterior desta rodada
continua em janela de observação, sem redução de uso ainda.

**Encaminhamento:** levar `equipamento_alias` e `execution_alert` ao mesmo
tratamento hoje dado a `equipamentos_tags` — itens mortos pendentes de plano
de remoção aprovado, não removidos nesta auditoria. Não fazer `DROP TABLE`
sem plano formal e backup pontual (Seção 4/7 da Constituição). Verificar com
a equipe se `radar_convenios.yml`/`job_descoberta_transferegov.py` deveria
rodar em cadência automática (destravaria `evidencia_transferegov`) e se há
decisão de carregar `data/raw/` de Acelerador Linear/INCA.

## Ingestão: estado e próxima auditoria obrigatória

O diagnóstico de 18/09 comprovou que as cargas FAF/TED e PERSUS/PRONON têm
dry-run, transação, chaves de origem, rejeições explícitas e reexecução
idempotente. A rodada atual confirmou que os scripts ainda existem e que a
centralização acrescentou scripts de backfill e preenchimento de itens.

Na próxima etapa de ingestão, validar separadamente:

1. idempotência e rollback dos importadores ativos contra base dedicada;
2. proveniência/hash e rejeições das fontes manuais;
3. todos os escritores de `equipamentos_tags` e a manutenção da auditoria de
   compatibilidade durante a janela de observação;
4. se scripts one-shot, seeds e correções pontuais ainda têm uso operacional
   documentado; e
5. que nenhuma carga reintroduz marcador de acelerador por inferência de
   programa, em vez de evidência individual.

## Migração para servidor novo: clone integral do Neon

**Correção de escopo (2026-09-22).** Um `alembic upgrade head` em um banco
vazio comprova somente que o *schema* pode ser criado. Ele não reconstrói o
estado operacional: usuários, decisões de configuração, catálogos, dados de
referência, execuções das pipelines, instrumentos e propostas importados,
monitoramento interno, eventos, ações e as alterações feitas pela equipe.

O Neon atual é, portanto, a fonte canônica a ser migrada para o próximo
servidor. A migração de servidor deve começar com o destino vazio e terminar
como um **clone lógico integral** da origem, via `pg_dump`/`pg_restore`,
preservando schema, dados, `alembic_version`, índices, constraints e histórico
de auditoria. Não é permitido substituir esse clone por reingestão de CSV,
planilhas ou APIs.

Em especial, `importar_planilha_monitoramento.py` é bootstrap único: reexecutá-lo
em uma base clonada pode sobrescrever campos preenchidos manualmente pela
equipe. As demais cargas manuais também não constituem mecanismo de
reconstrução do servidor; qualquer execução futura continua controlada e
autorizada conforme a fonte.

O procedimento de corte precisa ser executado e evidenciado em destino
isolado antes da mudança definitiva:

1. congelar escritas no Neon para definir um ponto consistente;
2. gerar dump lógico completo com credencial de leitura e registrar data,
   revisão Alembic e manifesto sem segredos;
3. restaurar em servidor novo vazio com credencial administrativa exclusiva;
4. executar `alembic current` e, somente se necessário, `alembic upgrade head`;
5. validar `auditar_drift_schema --strict`, `auditar_integridade_database` e
   contagens/relacionamentos essenciais entre origem e destino; e
6. fazer smoke test da aplicação no destino antes de trocar a conexão de
   produção, mantendo a origem íntegra para rollback.

**Estado:** a criação do schema vazio foi testada; o ensaio de
`pg_dump`/`pg_restore` ponta a ponta do Neon para um novo servidor ainda é
pendência de DevOps. Assim, a prontidão para *schema* vazio não deve ser
reportada como prontidão para migração de servidor até esse clone ser validado.

## Itens herdados, encaminhados ao diagnóstico correto

O relatório anterior mantinha backup/PITR/RPO-RTO, retenção e restauração
testada como não comprovados; esses itens seguem abertos até evidência nova do
ciclo DevOps. Dataset sintético/anonimizado e o CI que reconstrói a base e
valida up/down/drift também seguem pendentes. Eles não são dados como
resolvidos nesta rodada porque não foram revalidados no ambiente de segurança
ou DevOps.

## Critério de fechamento do Database nesta rodada

- [x] `auditar_drift_schema --strict` sem diferenças em base de teste e
      novamente no banco operacional.
- [x] Metadata dos índices parciais e FK `fase_geral_id` alinhada ao schema.
- [x] Modelo ER atualizado; conferência automática contra models/migrations
      continua pendente até eliminar o drift.
- [x] Auditoria dedicada de ingestão executada; auditoria de tags sem
      pendências e sem novos escritores no JSON legado.
- [x] Testes de migration, constraint e FK executados em PostgreSQL dedicado.
- [ ] Planos de limpeza aprovados antes de remover coluna, script, índice ou
      contexto histórico — inclui, desde 2026-09-24, `equipamento_alias` e
      `execution_alert` (tabelas vazias sem consumidor, ver achado acima).

## Evidências executadas nesta revisão

```text
OrbStack PostgreSQL (TEST_DATABASE_URL=sigeo_constitution_test)
  uv run alembic upgrade head
  uv run alembic downgrade -1
  uv run alembic upgrade head
  → c4d6e8f0a123 aplicado, reversível e reaplicável

TEST_DATABASE_URL=... uv run pytest -m db
  → 87 passed, 8 skipped

DATABASE_URL=... uv run python -m scripts.auditar_drift_schema --strict
  → models, schema e Mermaid alinhados; head = c4d6e8f0a123

TEST_DATABASE_URL=... uv run python -m scripts.auditar_tags_legadas
  → 0 pendências

auditar_integridade_database.run_checks(SessionLocal())
  → 8 verificações, todas com 0 violações
```

## Nota de conformidade Database — 9,7/10

A nota sobe de 9,6 para **9,7/10**. Schema, constraints, migrations e a
ausência de drift estão comprovados em PostgreSQL dedicado e novamente após o
deploy; a alteração compartilhada teve backup pontual confirmado. A nota não
é 10 porque PITR/RPO/RTO e restauração testada seguem pendentes no diagnóstico
de DevOps, a sequência ainda não é gate automático de CI, e a remoção física
de `equipamentos_tags` deve aguardar a janela de observação expand-contract.

**Atualização 2026-09-24:** a nota não muda — a auditoria de tabelas vazias
não encontrou drift, integridade violada nem migration malformada, só dois
itens mortos adicionais (`equipamento_alias`, `execution_alert`) que entram
na mesma fila de limpeza pendente já registrada para `equipamentos_tags`, e
dois casos de feature legítima ainda sem primeira execução
(`inca_estimate`/`accelerator_row` aguardando fonte em `data/raw/`;
`evidencia_transferegov` aguardando o job rodar).

### Atualização de ingestão controlada — PERSUS, 2026-09-24

A planilha `data/Controle PERSUS.xlsx` foi tratada como **complementação** dos
92 PERSUS I existentes, nunca como uma nova carga nem como fonte de CNES. A
conciliação usou o PERSUS existente como fonte definitiva de CNES e associou
as 34 linhas por identificadores de origem/localidade; quatro divergências da
planilha foram vinculadas somente após validação explícita da equipe.

No banco operacional foram preservados os 92 PERSUS I em `convenio` e ficaram
34 no escopo de monitoramento interno: 5 já existentes e 29 criados. A fonte
complementou 21 anos de instrumento e 22 NUPs quando ausentes, registrou 185
eventos detalhados, 110 eventos diretos de fase geral e 102 ações concluídas.
Os eventos de fase foram materializados em reparo idempotente de 2026-09-25:
`fase_geral_id` contextualiza um marco físico/regulatório, mas não substitui o
evento direto que o resumo usa para derivar a etapa atual. Não houve migration, alteração de schema nem
sobrescrita de CNES; os 58 PERSUS sem dados de controle permanecem somente em
Instrumentos Firmados. A rotina é idempotente por chave de origem e deduplica
evento/ação pelo conteúdo antes de inserir.

### Revalidação de evidência PERSUS — 2026-09-25

Uma revisão de leitura das três fontes PERSUS confirmou que a integridade
estrutural do banco permanece preservada (92 PERSUS I, 34 no escopo de
monitoramento), mas identificou uma lacuna de integridade semântica na
conciliação complementar. Dois instrumentos têm marcos detalhados sem fase
geral direta: `PS1-135842`/CNES 2576341 e `PS1-987594`/CNES 0009725. Por isso
o agregado mostra “Não iniciado” embora exista histórico operacional. O
reparo anterior de 110 fases continua válido e idempotente para os vínculos
elegíveis, mas não é evidência de cobertura integral dos 34 instrumentos.

Também foram encontradas seis datas de ocorrência futuras, 16 marcos de
inauguração sem conclusão direta e 141 marcos físico/regulatórios sem vínculo
de fase geral no conjunto de 120 instrumentos. Não há indício de drift,
violação de FK ou necessidade de migration; há uma pendência de saneamento
append-only e de regra de conciliação. O CNES do PERSUS persistido permanece a
chave definitiva: a fonte complementar só poderá usá-lo como fallback quando
o CNES for único na planilha, com NUP/código de obra/ano obrigatório nos casos
repetidos.

A planilha de entregas confirmou 29 inaugurações do Controle já coerentes no
banco, seis datas candidatas ainda ausentes e três divergentes. Datas ausentes
ou divergentes permanecem pendentes de precedência de fonte; não foram
sobrescritas nesta auditoria.

### Correção de precedência e fase — 2026-09-25

A precedência foi decidida pela equipe e aplicada: Entregas é a fonte padrão
de inauguração nas abas PERSUS-I e CONVÊNIO; Controle é exclusivo de PERSUS I,
para ações/marcos e como fallback quando Entregas não possui data. PRONON não
participa. A aplicação atualizou 14 datas com vínculo seguro, preservou 49
linhas sem data e 16 sem identidade inequívoca, e foi idempotente na
reexecução. Não houve alteração de CNES, NUP, schema ou migration.

O reparo append-only de fases passou a abranger todo o monitoramento: 69 fases
diretas foram reconstruídas de marcos ativos, ocorridos e semanticamente
inequívocos, além de uma fase PERSUS decorrente da nova precedência. Restam 33
marcos sem regra de promoção e seis ocorrências futuras, documentados no
diagnóstico de ingestão; ambos exigem decisão de negócio ou correção manual,
não mutação automática.

O fallback por CNES único foi aplicado somente para complementar PERSUS com
alias entre abas. Ele materializou 47 fases adicionais sem schema novo nem
alteração de CNES; o CNES 2576341 passou a refletir Comissionamento em
2025-10-10, com licença ainda prevista/pendente e sem inauguração inventada.

Na mesma execução, uma duplicidade histórica de evento revelou que o
deduplicador pressupunha unicidade que o banco não impõe. A primeira transação
foi revertida integralmente; o código foi corrigido para testar existência em
vez de exigir uma única linha. Não foi criada constraint retroativa nem houve
remoção física, pois a limpeza de histórico exige reconciliação específica.

## Fechamento — Plan Mode fechamento final (2026-09-25)

Duas das três pendências desta categoria foram fechadas
(`planmode-fechamento-final-2026-09-25.md`, Bloco 7):

- **`equipamento_alias`/`execution_alert`** — confirmadas sem consumidor real,
  removidas via migration `9c2e4f7a1d38` (DROP TABLE + enum `alert_type`).
- **Dataset sintético de desenvolvimento** — já existia de fato
  (`scripts/seed_monitoramento.py` + `tests/fixtures_cobertura.py`, usados
  por `conftest.py`/`e2e_ci.yml`); ganhou entrypoint standalone e
  documentação em `backend/README.md`.

**Segue pendente, agora com runbook pronto**: o ensaio `pg_dump`/`pg_restore`
ponta a ponta da migração de servidor está documentado passo a passo em
`runbook-devops.md`, mas não executado — exige `DATABASE_URL_MIGRATION` real
do Neon, credencial que a sessão que fechou este plano não tinha. Backup/
PITR/RPO-RTO continua sob responsabilidade de DevOps, sem evidência nova.
