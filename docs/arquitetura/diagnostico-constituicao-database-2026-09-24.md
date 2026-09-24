# Diagnóstico sênior — Constituição de Database (rodada 2, 2026-09-21)

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
      contexto histórico.

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
