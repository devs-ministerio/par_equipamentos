# Diagnóstico da Constituição de Database — 2026-09-29

## Escopo e método

Revisão estática (3 investigações paralelas, incluindo `alembic heads` local e leitura de
`models.py`/migrations) de todas as 11 seções de `padroes/database/constituicao_database.md`,
com foco em: (1) reverificar o P1 de drift de schema aberto no diagnóstico de 2026-09-28;
(2) auditar o que mudou desde então — tabela `PagamentoObraPersus`, notificações com escopo,
relatórios Excel/Word. Não foi executado DDL/DML.

## Evidências

- **Modelagem**: `PagamentoObraPersus` tem PK explícita, FK real com `ondelete`/`onupdate`
  explícitos, `tipo` como `CHECK` no banco (não `VARCHAR` livre), `chave_origem` com
  `UNIQUE` real e índice em `instrumento_id`. `tipologia`/`modalidade_onco` são `CHECK` de
  fato no banco, não só validação Pydantic. Cadeia Alembic local tem head único
  (`f7a8b9c0d1e2`), sem branches divergentes.
- **Transações**: as 8 funções de escrita de `monitoramento_eventos.py` gravam evento/ação e
  a notificação relacionada no mesmo `db.commit()` — sem risco de gravação parcial.
- **Índices**: `pagamento_obra_persus.instrumento_id` e
  `notificacao_destinatario(usuario_id, lida, created_at)` têm índice compatível com o filtro
  real de leitura.
- **Permissão mínima**: `sigeo_runtime`/`sigeo_migration` confirmados como separação real
  (testado ao vivo em 2026-09-17: `sigeo_runtime` tem `CREATE TABLE` negado).
- **Backup**: RPO 6h/RTO 4h com **exercício de restore real executado** em 23/09/2026 (branch
  `sigeo-restore-drill-2026-09-23`, 27 tabelas validadas) — não é só plano no papel.
- **Dataset sintético**: `seed_guard.py` bloqueia por substring `neon.tech`, cobrindo produção
  e homologação igualmente; dataset é gerado do zero, nunca cópia de produção.

## Avaliação

**Conformidade: 7,8/10** (queda frente aos 8,2 de 09-28 — nenhum P0, mas 1 bug de performance
real confirmado por leitura de código, o drift de produção piorou em vez de melhorar, e um gap
de Seção 6 nunca antes verificado ficou confirmado).

### P1 (novo, bug real) — N+1 na timeline do relatório completo

`app/services/relatorios.py` (`_tabela_monitoramento_timeline`/`_montar_instrumentos_repasse_docx`)
dispara 1 query de eventos + 1 de ações por instrumento dentro do loop, além de recarregar
`listar_marcos_catalogo` a cada iteração em vez de 1x fora do loop. Para um recorte de ~100
instrumentos (`nivel=completo`), isso é ~300 queries onde 3 bastariam. O próprio projeto já
tem o padrão correto para esse caso (`mapear_responsaveis_por_instrumentos`, resolução em lote
via `IN`) — não foi reaplicado aqui. Recomenda-se `listar_eventos_de_instrumentos`/
`listar_acoes_de_instrumentos` em lote, agrupando em memória, e içar `listar_marcos_catalogo`
para fora do loop.

### P1 (persistente, piorou) — drift de migração entre local e produção/homologação

Homologação continua travada em `7fd36a4d65a5` (`InsufficientPrivilege` no `ALTER TYPE`) —
hoje **9 revisões** atrás do head local (`f7a8b9c0d1e2`), contra 6 na medição de 09-28: o
código segue avançando enquanto o bloqueio de permissão permanece sem solução. Produção foi
reconciliada até `c3d4e5f6a7b8` no mesmo dia 09-28, mas local avançou mais 3 migrations desde
então (normalização de município/IBGE, proveniência estruturada) sem evidência documentada de
aplicação em produção — o drift reabriu. Confirma-se também, em retrospecto, que as 2
migrations aplicadas manualmente via `DATABASE_URL_MIGRATION` (fora de `alembic upgrade head`)
violaram a Seção 4 em espírito ("nunca alteração manual direto em produção"), mesmo tendo sido
idempotentes e depois formalmente reconciliadas — o risco real está no intervalo entre aplicar
e reconciliar.

### P1 (novo gap, nunca verificado antes) — nenhuma coluna sensível marcada no schema

`grep -c "comment=" backend/app/db/models.py` = 0. A Seção 6 exige identificação explícita
(comentário de coluna ou convenção de nome) de dado sensível para orientar mascaramento/log —
hoje nenhuma das colunas candidatas (`User.email`, as 5 colunas de CNPJ, `CnesEstabelecimento.
cep`, `Convenio.siconv_raw`/`transferegov_raw`, que o próprio CLAUDE.md descreve como contendo
CEP/endereço/telefone) tem qualquer marcação. `cpf_hash` já foi removida corretamente em
2026-09-17 — o gap é sobre o que sobrou, nunca fechado.

### P2 (novo) — desvio de estilo nas 2 migrations manuais

`a1b2c3d4e5f6`/`b2c3d4e5f6a7` usam SQL cru com `IF NOT EXISTS` em vez da API do Alembic
(`op.add_column`/`op.create_table`) que todas as outras migrations da árvore usam — decisão
pontual documentada, não repetida em nenhuma migration seguinte. Baixo risco, mas fica como
desvio de padrão registrado.

### P2 (novo, baixo risco) — N+1 de dedup em script batch PERSUS

`complementar_persus_fontes_extras.py` faz `db.query(PagamentoObraPersus).filter(chave_origem
==...).first()` por linha de planilha dentro do loop de ingestão — script offline idempotente
contra tabela pequena, não afeta runtime da API. Otimização opcional: pré-carregar `set` de
`chave_origem` existentes antes do loop.

### P2 (persistente/novo) — separação de role sem script versionado

`sigeo_runtime`/`sigeo_migration` são reais (testado ao vivo), mas o `GRANT`/`REVOKE` que os
define só existe como narrativa no Plan Mode — nenhum `.sql` versionado no repo reproduz essa
configuração caso o role precise ser recriado. Gap de reprodutibilidade, não de segurança.

### P2 (persistente desde 09-28) — ensaio `pg_dump`/`pg_restore` de migração de servidor

Runbook completo (`docs/arquitetura/runbook-devops.md`), mas nunca executado — distinto do
PITR, que já foi testado com sucesso.

## Próximo Plan Mode

Bloco de correção: resolver N+1 de `relatorios.py` (batch de eventos/ações/marcos) + aplicar
as migrations pendentes em produção (fechar o drift antes que cresça mais) + adicionar
`comment=` nas colunas sensíveis identificadas nesta rodada. Desbloqueio de permissão do Neon
de homologação (`InsufficientPrivilege`) é bloco operacional separado, já registrado
anteriormente. Script versionado de `GRANT`/`REVOKE` e ensaio `pg_dump`/`pg_restore` seguem
como itens de menor prioridade, sem urgência nova.
