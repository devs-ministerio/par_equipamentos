# Plan Mode — fechamento de Database e Ingestão (2026-09-21)

## Objetivo

Fechar os achados pendentes de
`diagnostico-constituicao-database-2026-09-21.md` e
`diagnostico-ingestao-dados-2026-09-21.md`, sem apagar schema, fonte ou
histórico antes de uma reconciliação verificável.

O plano segue a Constituição de Database: schema em `models.py` e migrations
alinhados, constraints físicas explícitas, alteração reversível, teste em
PostgreSQL dedicado, índice baseado no contrato de consulta e operação de
ingestão transacional/idempotente. Esta execução continua dentro da sequência
global `Database → Segurança → Backend → Frontend → DevOps → Qualidade`.

## Escopo e decisões já fechadas

- O CSV PRONON foi removido: PRONON vigente é tratado apenas como proposta no
  Radar. Não reintroduzir PRONON em Instrumentos Firmados sem nova fonte e
  decisão de produto.
- `equipamentos_tags` é compatibilidade temporária; as 86 ocorrências sem
  evidência centralizada impedem removê-lo nesta execução inicial.
- As cópias e scripts B813 são candidatos a arquivamento/remoção, não mortos
  comprovados. O plano exige inventário e decisão antes de qualquer exclusão.
- Nenhuma migration já aplicada será alterada. A correção da FK será uma nova
  revision Alembic, com `upgrade` e `downgrade`.

## Execução em 2026-09-21

- Metadata dos três índices parciais foi alinhada ao model; o drift restante é
  apenas a FK que depende da nova migration e do head ainda não aplicado.
- Importador FAF/TED ganhou `--dry-run` e `--somente-ausentes`; PERSUS passou
  a aceitar fontes injetáveis; backfill de itens passou a simular por padrão.
- B813 foi classificado como histórico, a cópia FAF/TED duplicada e idêntica
  foi removida e o inventário de fontes foi registrado.
- A auditoria legada encontrou zero pendências; escritores de
  `equipamentos_tags` foram removidos. A remoção física da coluna permanece
  deliberadamente posterior, como previsto no expand-contract.
- Gate final concluído em 2026-09-21: `TEST_DATABASE_URL` dedicado foi
  provisionado no OrbStack; a migration passou por subida, reversão e nova
  subida, e o backup foi confirmado antes da aplicação compartilhada.

## Pré-requisitos operacionais

1. **Concluído:** provisionado PostgreSQL dedicado do OrbStack, no banco
   `sigeo_constitution_test`, exposto apenas localmente em `127.0.0.1:55432`.
   `TEST_DATABASE_URL` deve sempre apontar para banco com `test` ou `pytest`
   no nome; nunca para Neon ou a base operacional.
2. **Concluído:** snapshot pré-migration criado em
   `/private/tmp/sigeo-pre-c4d6e8f0a123.dump` (SHA-256
   `56764c6b457054a6149fe06bf60dc19fb5d38dec58c34ae7b4fcf8a121ee8b69`)
   antes da aplicação compartilhada.
3. Executar migrations somente com credencial de migration; runtime permanece
   sem DDL.
4. Preservar as fontes ativas atuais: planilha FAF/TED em `data/`, PERSUS I em
   `docs/monitoramento-equipamentos/` e PERSUS II em
   `backend/scripts/data/persus_ii.csv`.

## Fase 1 — eliminar drift entre metadata e schema

### 1.1 Declarar os índices únicos parciais no model

- Em `backend/app/db/models.py`, acrescentar a `EquipamentoMarcador.__table_args__`
  os três `Index` já existentes, com os mesmos nomes, colunas, `unique=True` e
  `postgresql_where` da migration `f4c7e1d9a820`:
  - `uq_equipamento_marcador_convenio`;
  - `uq_equipamento_marcador_proposta`;
  - `uq_equipamento_marcador_instrumento`.
- Não criar migration para estes índices: a alteração é somente de metadata;
  a base já possui as estruturas físicas válidas.

### 1.2 Tornar a ação da FK explícita

- Criar nova migration após `a6b2c4d8e913` que substitua exclusivamente a FK
  de `evento_marco.fase_geral_id` por uma constraint nomeada com `ON DELETE
  RESTRICT` e `ON UPDATE RESTRICT`.
- O `downgrade` restaura exatamente a definição anterior, sem tocar na coluna
  nem nos eventos existentes.
- Antes de aplicar em ambiente compartilhado, confirmar que a exclusão de um
  `marco_catalogo` referenciado já é bloqueada e que não há dependência de
  cascade implícito.

### 1.3 Cobertura de regressão

- Estender `backend/tests/test_schema_migrations.py` para manter o diff vazio
  depois da nova migration.
- Acrescentar teste de metadados/integração que confirme as três unicidades
  parciais: mesma evidência na mesma origem falha; a mesma chave em origens
  distintas continua permitida.
- Acrescentar teste que inspecione a FK `fase_geral_id` e valide os dois verbos
  explícitos, evitando regressão para default implícito.

**Gate da fase:** em banco limpo, `alembic upgrade head`, `alembic downgrade
-1`, `alembic upgrade head`, `pytest -m db` e
`python -m scripts.auditar_drift_schema --strict` passam com diff vazio.

## Fase 2 — padronizar ingestão ativa e torná-la comprovável

### 2.1 Contrato único de execução

- Fazer `importar_planilha_monitoramento.py` expor CLI explícita com
  `--dry-run` e `--somente-ausentes`; o `main` deve encaminhar esses flags a
  `run()`.
- Padronizar os escritores ativos para retornar um resumo estruturado com
  criados, atualizados, eventos, rejeitados e motivos; o CLI apenas formata a
  saída e retorna código não zero para falha de validação.
- Em toda simulação, usar a mesma transação do modo aplicado e chamar
  `rollback`; nunca implementar dry-run apenas omitindo `commit`.
- Manter a regra de não sobrescrever equipamento físico nem edições manuais:
  reconciliação posterior usa somente `--somente-ausentes`.

### 2.2 Separar ativo de one-shot

- Manter como importadores ativos somente FAF/TED e PERSUS I/II, cada qual
  com fonte, chave de upsert e dry-run documentados.
- Catalogar `backfill_marcadores_equipamentos.py`,
  `preencher_marcadores_itens_plano.py`, `corrigir_escopo_instrumentos_firmados.py`,
  `renomear_identificadores_instrumentos_firmados.py` e os três scripts B813
  como `one-shot` ou ativos, com responsável, data/condição de uso e risco.
- Para script que permanecer ativo, incluir dry-run, transação e resumo. Para
  script one-shot sem execução futura, remover do caminho operacional e
  documentar o artefato histórico; não gastar esforço em transformar legado
  deliberadamente aposentado em pipeline recorrente.

### 2.3 Testes de integração de importação

- Criar fixtures mínimas e versionadas para FAF/TED, PERSUS I e PERSUS II,
  com casos de CNES válido, CNES rejeitado, NUP/identidade ausente, zeros à
  esquerda, duplicata de linha e equipamento físico pré-preenchido.
- Extrair leitores de planilha/CSV ou aceitar `Path` injetável nos importadores
  para que os testes nunca dependam da planilha operacional completa.
- Em PostgreSQL dedicado, testar para cada fonte: primeira aplicação,
  reexecução, dry-run, rejeições, eventos append-only e modo
  `somente_ausentes`.
- Confirmar que PERSUS não cria acelerador por inferência fora da evidência
  declarada pela fonte, e que PRONON não entra em Instrumentos Firmados.

**Gate da fase:** os testes demonstram que a segunda execução não cria linhas,
eventos ou ações novos, e que o estado após dry-run é idêntico ao inicial.

## Fase 3 — decidir e limpar B813 e fontes duplicadas

1. Gerar inventário de referências de código/documentação para:
   - a fonte canônica `data/Monitoramento Base de Dados - Convênio FAF TED.xlsx`;
   - as duas cópias históricas de `B8131710.xlsx`;
   - `importar_batimento_b8131710.py`,
     `atualizar_equipamento_b8131710.py` e `validar_dados_tres_fontes.py`.
2. Declarar uma única fonte canônica para cada uso ativo; documento pode
   referenciar a fonte, mas não duplicá-la sem motivo de auditoria e checksum.
3. Para cada cópia/script sem consumidor operacional, escolher formalmente:
   arquivar com metadados (origem, período, SHA-256, motivo) ou remover.
4. Antes de exclusão, executar `rg`, testar os comandos/documentação restantes
   e atualizar links, docstrings, diagnósticos e `AGENTS.md`.

**Gate da fase:** nenhum script disponível como rotina aponta para planilha
defasada; toda fonte restante tem dono, propósito e caminho canônico.

## Fase 4 — reconciliar e remover `equipamentos_tags` por expand-contract

### 4.1 Inventário sem escrita

- Criar auditor somente de leitura que liste as 86 tags legadas sem marcador,
  com `convenio`, origem, valor legado, possíveis descrições-fonte e proposta
  de classificação; gerar relatório revisável, sem alterar o banco.
- Separar os casos em: evidência recuperável, ausência justificada ou dado que
  precisa permanecer manual. Decisões humanas devem ser rastreáveis.

### 4.2 Migração de consumidores e escritores

- Corrigir/backfill apenas as evidências aprovadas em transação idempotente.
- Confirmar por testes e API que filtros, cards e marcadores usam somente
  `equipamento_marcador`; consultar `equipamentos_tags` apenas na auditoria de
  compatibilidade durante a transição.
- Remover novos writes ao JSON legado dos importadores e backfills depois que o
  relatório não tiver pendências não justificadas.

### 4.3 Remoção física posterior

- Em plan-mode separado, após aprovação do relatório e backup, criar migration
  expand-contract para remover a coluna e scripts de compatibilidade.
- Não incluir essa migration na mesma entrega da reconciliação: manter uma
  janela de observação com auditoria de drift e reexecução de importadores.

**Gate da fase:** zero consumidor/escritor de `equipamentos_tags`, evidências
reconciliadas e decisão registrada para cada exceção antes da migration
destrutiva.

## Atualização obrigatória de contexto

Ao concluir cada fase, atualizar no mesmo PR:

- `AGENTS.md`: retirar a contagem/destino histórico de 21 PRONON e a afirmação
  de que PERSUS/PRONON entram pelo mesmo importador; refletir os universos
  vigentes.
- `docs/arquitetura/diagnostico-constituicao-database-2026-09-21.md` e
  `diagnostico-ingestao-dados-2026-09-21.md`: marcar achados fechados com
  evidência, sem reescrever o histórico.
- `docs/database/modelo_er.md` e `modelo_er.mermaid`: confirmar constraints e
  tabelas efetivamente aplicadas após a migration.
- Docstrings, README operacional e comandos de cada importador: alinhar fonte,
  destino, flag de simulação e classificação ativo/one-shot.

## Sequência de validação e entrega

1. Banco PostgreSQL de teste: migration up/down/up e auditor strict.
2. Testes de integração de schema, constraints e importadores.
3. Dry-run das fontes ativas, com relatório anexado ao PR.
4. Auditoria de integridade e conferência de contagens por tipo de contratação.
5. Revisão da limpeza B813 e do relatório de tags, sem remoção destrutiva
   pendente de decisão.
6. **Concluído:** backup confirmado, migration aplicada com credencial correta
   e auditoria pós-deploy sem drift (`c4d6e8f0a123`).

## Fora de escopo desta execução

- Backup/PITR, RPO/RTO, CI e dataset sintético permanecem itens do diagnóstico
  DevOps/Segurança, embora este plano dependa de banco dedicado para validar.
- Não alterar regras de cobertura, déficit, distância ou produtividade.
- Não reintroduzir PRONON em Instrumentos Firmados.
