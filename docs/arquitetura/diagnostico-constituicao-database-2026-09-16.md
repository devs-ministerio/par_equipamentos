# Diagnóstico da Constituição Database — validação direta no Neon

Data original: 2026-09-16. **Reexecutado em 2026-09-17** depois da implementação do Plan Mode
(`planmode-database-2026-09-16.md`, Rodada 4) — ver "Atualização 2026-09-17" ao final de cada seção
afetada e o novo veredito ao final do documento. O corpo original abaixo fica como registro
histórico do estado encontrado; não foi reescrito por cima.

## Escopo e método

Este documento substitui o diagnóstico anterior, baseado em código, migrations
e PostgreSQL local. A revisão atual confronta
`padroes/database/constituicao_database.md` com o **Neon configurado em
`backend/.env`**, usando somente transações `READ ONLY`.

Foram validados revision Alembic, drift entre schema físico e metadata,
PKs, FKs, ações referenciais, constraints, índices, privilégios, SSL,
cardinalidade, órfãos, duplicidades, invariantes, coerência dos agregados,
planos reais com `EXPLAIN ANALYZE` e aderência do Mermaid.

Não foram aplicadas migrations, correções, DDL, DML ou mudanças de privilégio.
Backup, retenção e PITR dependem do provedor e permanecem **não comprovados**.

> **2026-09-17**: a rodada de reverificação abaixo aplicou DDL/DML de fato (migrations, roles),
> autorizada explicitamente pelo usuário ("o banco Neon é de desenvolvimento pode rodar todo o
> plano no Neon") — deixa de valer a restrição "não foram aplicadas migrations/DDL" só para essa
> rodada; o método (validar direto no Neon) continua o mesmo.

## Resumo executivo

O conteúdo do Neon está íntegro. O banco está no head Alembic conhecido,
todas as tabelas de domínio possuem PK, as 23 FKs têm ações explícitas,
nenhum índice está inválido e todas as checagens de órfão, duplicidade e valor
inválido retornaram zero. Nas três famílias publicadas, `macro_coverage`
coincide exatamente com `equipment_offer_row`.

Há, porém, drift de schema: `models.py` agora declara `refresh_token`, seu
índice e sua constraint única, mas não existe migration correspondente nem
tabela no Neon. O Mermaid também não representa essa entidade. O head está
aplicado, mas já não descreve todo o modelo da aplicação.

Também foram comprovados dois problemas operacionais graves. A conexão
apareceu em `pg_stat_ssl` com `ssl=false`, e o usuário de runtime, embora
não seja superuser, possui `CREATEDB`, `CREATEROLE` e `CREATE` no schema.

Avaliação original (2026-09-16): **6,8/10 de conformidade database no Neon**.

- Schema físico e integridade dos dados: **9,5/10**.
- Migrations e ausência de drift: **5/10**.
- Queries e performance medidas: **8/10**.
- Segurança de conexão e privilégio mínimo: **2/10**.
- Backup e restauração: **não comprovados**.

A nota é menor que a avaliação local anterior porque agora inclui operação e
segurança reais do ambiente compartilhado.

### Atualização 2026-09-17 — pós-implementação do Plan Mode

Reexecutados no Neon real (não só no clone local) nesta data: contagem de tabelas/FKs/índices,
privilégio dos roles conectados, `\conninfo` de sessão, `diff_metadata_vs_banco` (drift), e o mesmo
`EXPLAIN` de autocomplete CNES. Os dois P0 de segurança e o P0 de schema fecharam; o P1 de
performance fechou também. Avaliação atualizada: **9,3/10**.

- Schema físico e integridade dos dados: **9,5/10** (sem mudança — já era o ponto forte).
- Migrations e ausência de drift: **10/10** (`refresh_token` migrado, `diff_metadata_vs_banco`
  retorna `[]` contra o Neon real, migration desacoplada do boot).
- Queries e performance medidas: **9,5/10** (autocomplete CNES: 227ms → 0,3ms comprovado no Neon;
  falta só medir as demais consultas do zero, mas nada indicava problema nelas).
- Segurança de conexão e privilégio mínimo: **9/10** (SSL sempre foi real, achado original era
  leitura equivocada da métrica; privilégio mínimo aplicado e testado). Não é 10 porque
  `neondb_owner` continua existindo com `CREATEDB`/`CREATEROLE` — não é mais usado por nenhuma
  credencial de aplicação, mas o Neon não permite removê-lo nem revogar esses atributos do role
  gerenciado da conta.
- Backup e restauração: **segue não comprovado** — fora do escopo deste Plan Mode (ciclo devops).

A nota não chega a 10 só por causa de backup/PITR (não comprovado, devops) e do atributo residual
de `neondb_owner` (fora do controle do projeto, não da aplicação).

## Estado comprovado

### Revision e drift

- Head Alembic dos arquivos: `9d2e13b1f93a`.
- Revision aplicada no Neon: `9d2e13b1f93a`.
- O comparador encontrou a tabela `refresh_token` e o índice
  `idx_refresh_token_user` ausentes no banco.
- `uq_refresh_token_token_hash` depende da tabela e também não existe.
- `docs/database/modelo_er.mermaid` não contém `refresh_token`.

Conclusão: **não há migration pendente; há migration faltando**. Reexecutar
`alembic upgrade head` não corrige o drift.

### Inventário físico

- 22 tabelas físicas, incluindo `alembic_version`.
- Zero tabela de domínio sem PK.
- 23 foreign keys.
- Zero FK fora do `ON UPDATE RESTRICT` explícito esperado.
- 162 constraints reportadas como `CHECK` pelo catálogo.
- 7 constraints `UNIQUE`.
- 46 índices; zero inválido.
- 7 colunas JSONB.

O modelo espera agora 23 tabelas por causa de `refresh_token`; o Neon tem 22.

#### Atualização 2026-09-17

Reexecutado contra o Neon real: `revision` aplicada = `efd3e49db7f8` (head atual, inclui
`refresh_token` e o índice trigram de CNES). `diff_metadata_vs_banco(engine, Base.metadata)` retorna
`[]` — zero divergência entre `models.py` e o schema físico. Inventário atual: **23 tabelas**, **24
foreign keys** (a nova é `refresh_token.user_id → user.id`), **50 índices** (4 a mais que os 46
originais: `idx_refresh_token_user`, `uq_refresh_token_token_hash`, `pk_refresh_token` e
`idx_cnes_estabelecimento_nome_trgm`). `docs/database/modelo_er.mermaid`/`.md` atualizados com
`refresh_token` e com o índice trigram.

### Volume observado

Valores aproximados de `pg_stat_user_tables`:

| Tabela | Linhas | Tamanho total |
|---|---:|---:|
| `cnes_estabelecimento` | 635.113 | 120,2 MB |
| `municipality_coverage` | 16.710 | 6,5 MB |
| `equipment_offer_row` | 12.264 | 9,3 MB |
| `municipality_population_row` | 11.140 | 1,1 MB |
| `convenio` | 403 | 6,3 MB |
| `evento_marco` | 368 | 131 KB |
| `macro_coverage` | 363 | 180 KB |
| `instrumento_equipamento` | 86 | 90 KB |
| `acao_monitoramento` | 25 | 49 KB |

As demais tabelas têm até 23 linhas ou estão vazias. A massa relevante para
performance hoje é `cnes_estabelecimento`.

## Integridade dos dados

As oito checagens do auditor retornaram zero:

- CNES órfão em convênio, instrumento ou proposta;
- proposta aceita sem instrumento esperado;
- instrumento TransfereGov sem proposta aceita;
- código CNES fora de sete dígitos;
- coordenada fora do intervalo;
- população, demanda ou quantidade negativa.

Checagens adicionais também retornaram zero:

- duplicidade de competência por família/label;
- duplicidade de convênio, instrumento ou email;
- execução sem competência;
- evento ou ação sem instrumento;
- mais de uma decisão de configuração vigente por chave;
- `in_use_qty > existing_qty` em oferta;
- `available_qty > existing_qty` em macro ou município.

### Coerência das tabelas derivadas

| Família | Macros | Ofertas | Municípios | Delta existente | Delta SUS/em uso |
|---|---:|---:|---:|---:|---:|
| PET-CT | 121 | 177 | 5.570 | 0 | 0 |
| Ressonância | 121 | 3.803 | 5.570 | 0 | 0 |
| Tomógrafo | 121 | 8.284 | 5.570 | 0 | 0 |

Isso comprova no Neon que `macro_coverage.available_qty` coincide com a soma
de `equipment_offer_row.in_use_qty` onde `sus_flag=true`.

A diferença 4.381 × 4.471 observada no banco local não se reproduz no Neon.
Ela aponta fixture/carga local obsoleta, sem justificar alteração no dado
remoto consistente.

## Performance medida no Neon

Planos executados com `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` em transação
somente leitura:

| Consulta | Execução | Plano | Avaliação |
|---|---:|---|---|
| CNES por nome, encontrado cedo | 0,053 ms | Seq Scan + LIMIT | Depende da posição |
| CNES por nome, sem resultado | 227,143 ms | Parallel Seq Scan | Gargalo confirmado |
| CNES por prefixo | 0,283 ms | Bitmap Heap Scan | Adequado |
| Primeira página de convênios | 0,092 ms | Index Scan | Adequado |
| Instrumentos ordenados | 0,093 ms | Seq Scan de 86 linhas | Adequado |
| Cobertura macro por família | 1,089 ms | Bitmap Heap Scan | Adequado |
| Municípios por macro | 1,590 ms | Index Scan | Adequado |
| Totais de oferta | 2,117 ms | Bitmap Heap Scan | Adequado |

Os tempos são uma amostra e variam com cache, rede e carga.

### Achado de performance

O autocomplete usa `ILIKE '%texto%'` sobre 635 mil estabelecimentos. Uma
busca sem correspondência varre a tabela e levou cerca de 227 ms somente no
banco. Deve-se testar `pg_trgm` e índice GIN em banco dedicado, medir custo e
tamanho e só então criar migration. Não há evidência para novos índices nas
demais consultas medidas.

**Atualização 2026-09-17 — resolvido**: medido em banco descartável de mesmo volume
(`par_equipamentos_pytest_loaded`, 635.113 linhas) antes de migrar — pior caso caiu de ~227ms
(`Seq Scan`) pra ~0,3ms (`Bitmap Index Scan`), busca comum (~1300 resultados) em ~10ms, índice de
39MB (~19% do tamanho da tabela). Migration `efd3e49db7f8` (`pg_trgm` + GIN em
`nome_estabelecimento`, `CREATE INDEX CONCURRENTLY`) aplicada ao Neon e reconfirmada lá: o mesmo
`EXPLAIN (ANALYZE, BUFFERS)` que antes mostrava 227ms agora mostra **0,32ms** com `Bitmap Index Scan
on idx_cnes_estabelecimento_nome_trgm`.

## Pontos conformes

- Todas as tabelas de domínio físicas têm PK.
- FKs e ações referenciais são explícitas.
- CNES, coordenadas e valores não negativos têm integridade física e dados
  conformes.
- Dinheiro usa `NUMERIC`; datas usam tipos temporais.
- Estados internos relevantes usam enum ou check.
- Configuração vigente possui unicidade parcial e histórico temporal.
- Índices existentes estão válidos.
- Agregados publicados estão coerentes com a oferta granular.
- Consultas principais têm planos adequados, exceto busca textual CNES.
- O usuário conectado não é superuser.
- A credencial permanece fora do repositório.
- **(2026-09-17)** Busca textual CNES agora também tem plano adequado (índice trigram).
- **(2026-09-17)** Runtime e migration são roles distintos, nenhum com `CREATEDB`/`CREATEROLE`.
- **(2026-09-17)** Criptografia em trânsito confirmada real (TLS 1.3), não só presumida.
- **(2026-09-17)** `refresh_token` migrado, testado e sem drift.
- **(2026-09-17)** Migration desacoplada do boot da API e dos jobs de dado.

## Divergências prioritárias

### P0 — modelo sem migration — RESOLVIDO em 2026-09-17

`RefreshToken` existe na metadata, mas não no Neon. Qualquer fluxo que tente
persisti-lo falhará com relação inexistente.

Aplicação correta:

1. aprovar Plan Mode específico para sessão e schema;
2. criar migration aditiva;
3. revisar FK, ações, unicidade, expiração e índices;
4. testar upgrade, downgrade, constraints e concorrência localmente;
5. atualizar Mermaid;
6. aplicar pelo fluxo protegido de migration.

**Fechamento**: migration `5557cabd4a4c` seguiu exatamente os 6 passos acima (Plan Mode Bloco 2,
`planmode-database-2026-09-16.md`) — testada local (up/down simétrico, zero drift) e aplicada ao
Neon. `refresh_token` existe lá com PK/FK/UNIQUE/índice batendo com o model. Mermaid/ER atualizados.
Tabela ainda não é consumida por nenhuma rota (wiring de auth é escopo do Plan Mode de segurança).

### P0 — conexão sem SSL comprovado — RECLASSIFICADO em 2026-09-17 (não era um gap real)

`pg_stat_ssl` retornou `false` para a sessão de auditoria. A configuração
atual não garantiu criptografia em trânsito na conexão observada.

É necessário exigir `sslmode=require` ou `verify-full`, conforme suporte do
Neon, falhar em produção quando SSL não estiver ativo e comprovar novamente
`pg_stat_ssl=true`.

**Achado da reverificação**: `pg_stat_ssl=false` é um artefato da arquitetura de proxy serverless do
Neon — o proxy termina o TLS do cliente e encaminha pro compute Postgres por um caminho interno; a
métrica reflete esse último salto, não o canal real cliente↔Neon. Confirmado com `psql \conninfo` na
mesma sessão de auditoria: `SSL Connection: true`, `TLSv1.3`, `TLS_AES_256_GCM_SHA384`. Confirmado
também que o servidor **recusa ativamente** `sslmode=disable` (`ERROR: connection is insecure`) — ou
seja, criptografia em trânsito já era **obrigatória e real**, não uma suposição. O diagnóstico
original leu o sinal errado; não houve (nem foi necessária) nenhuma mudança de código ou de
`DATABASE_URL` para "corrigir" isso — `sslmode=require` já estava na URL desde antes.

### P0 — usuário de runtime excessivamente privilegiado — RESOLVIDO em 2026-09-17

O role conectado apresentou:

- `SUPERUSER=false`;
- `CREATEDB=true`;
- `CREATEROLE=true`;
- `CREATE` no schema.

A API não precisa criar banco, role ou tabela durante requests. Deve existir
um role de runtime só com conexão, uso do schema, DML e sequences necessárias,
e outro role separado para migrations. A credencial do serviço deve ser
rotacionada após a separação.

**Fechamento**: criados `sigeo_runtime` (`CONNECT`/`USAGE`/`SELECT,INSERT,UPDATE,DELETE`/sequences)
e `sigeo_migration` (dono de todas as 23 tabelas e 21 sequences do schema `public`, único com DDL) —
nenhum dos dois com `CREATEDB`/`CREATEROLE`/`SUPERUSER`, confirmado via `pg_roles`. `neondb_owner`
não é mais usado por nenhuma credencial de aplicação (continua existindo com os atributos elevados,
mas isso é uma restrição da plataforma Neon sobre o role gerenciado da conta, não algo que o projeto
controla ou usa). Testado: `sigeo_runtime` tem `CREATE TABLE` negado; `sigeo_migration` roda `ALTER
TABLE` normalmente. `Settings.database_url_migration` (`backend/app/config.py`) separa as duas
credenciais; `.env`/`.env.example` documentam `DATABASE_URL_MIGRATION`.

### P1 — autocomplete CNES — RESOLVIDO em 2026-09-17

O pior caso de 227 ms comprova a necessidade de avaliar trigram. O índice só
deve ser aplicado após Plan Mode, teste de extensão disponível, tamanho,
ganho e custo de escrita.

**Fechamento**: ver "Achado de performance" acima — medido em banco descartável antes de migrar,
aplicado ao Neon, resultado comprovado (227ms → 0,32ms).

### P1 — backup e recuperação não comprovados

SQL não comprova configuração do painel Neon. Faltam evidências de:

- PITR ou snapshot;
- frequência e retenção;
- restore testado;
- RPO e RTO;
- alerta de falha;
- snapshot anterior a migration destrutiva.

### P1 — migration acoplada ao boot e jobs — RESOLVIDO em 2026-09-17

`render.yaml` e os workflows continuam executando `alembic upgrade head`.
Com um usuário privilegiado e secret apontando para Neon, uma ref não validada
pode aplicar DDL diretamente. O risco também está no diagnóstico DevOps.

**Fechamento**: `alembic upgrade head` removido do `startCommand` de `render.yaml` e dos steps de
`pipelines.yml`/`radar_convenios.yml` (nunca precisaram de DDL). Passou a rodar isolado, sob
demanda, no workflow novo `.github/workflows/migrar_banco.yml` (`workflow_dispatch`, credencial
`DATABASE_URL_MIGRATION` dedicada) — e como `DATABASE_URL` da API/pipelines agora é `sigeo_runtime`
(sem privilégio de DDL), mesmo que alguém reintroduza a chamada no boot por engano, ela falharia por
permissão em vez de aplicar DDL silenciosamente.

### P1 — dados pessoais e ambientes

O Neon contém contatos e dados operacionais. Não há evidência de classificação,
retenção, mascaramento de backup ou dataset anonimizado para desenvolvimento.
A divergência do banco local reforça a necessidade de fixtures sintéticas e
reproduzíveis.

### P2 — nomenclatura e JSONB

- O schema mistura português e inglês por histórico. Renomear por estética não
  compensa o risco; eventual mudança deve usar expand-contract.
- Os sete JSONB representam payload externo, tags ou auditoria. Devem ser
  revistos quando passarem a ser filtrados ou agregados com frequência.
- Relações polimórficas de auditoria/notificação seguem sem FK por desenho e
  precisam continuar documentadas.

## Sequência recomendada

**Status em 2026-09-17**: Blocos 1, 2, 3 e a parte de migration-do-boot do Bloco 4 aplicados no
Neon (ver `planmode-database-2026-09-16.md`, Rodada 4, para o relato completo de execução). Bloco 4
"backup" (era numerado separado na sequência original abaixo) e a parte de CI do Bloco 5 seguem
pendentes, fora do escopo deste Plan Mode.

### Bloco 1 — segurança operacional — ✅ aplicado

- Exigir SSL e comprovar `pg_stat_ssl=true`. — SSL já era real (achado reclassificado, ver acima);
  `pg_stat_ssl` continua `false` por ser artefato do proxy Neon, não indicador confiável aqui.
- Separar role runtime e role migration. — ✅ `sigeo_runtime`/`sigeo_migration`.
- Remover `CREATEDB`, `CREATEROLE` e DDL do runtime. — ✅ nenhum dos dois roles novos tem esses
  atributos; `neondb_owner` (que tem) não é mais usado pela aplicação.
- Confirmar API, pipelines e migrations com as identidades corretas. — ✅ testado (`sigeo_runtime`
  sem `CREATE TABLE`, `sigeo_migration` com `ALTER TABLE`, app lê/escreve normalmente).

### Bloco 2 — refresh token — ✅ aplicado

- Aprovar Plan Mode da sessão. — ✅.
- Criar e testar a migration aditiva. — ✅ `5557cabd4a4c`, up/down simétrico.
- Atualizar Mermaid e drift checker. — ✅.
- Aplicar ao Neon por fluxo protegido. — ✅.

### Bloco 3 — busca CNES — ✅ aplicado

- Testar `pg_trgm` e GIN em banco dedicado. — ✅ `par_equipamentos_pytest_loaded`.
- Comparar tempo, tamanho e custo de escrita. — ✅ 227ms→0,3ms, 39MB (~19% da tabela).
- Aplicar somente se o ganho justificar. — ✅ ganho de 2-3 ordens de magnitude, aplicado.

### Bloco 4 — backup — pendente (ciclo devops)

- Documentar retenção, RPO e RTO.
- Executar restore isolado e registrar evidência.
- Criar runbook e alerta.

### Bloco 5 — CI — pendente (parte database aguarda CI de backend existir)

- Rodar Alembic, testes PostgreSQL e `auditar_drift_schema --strict`.
- Falhar se modelo, migration e Mermaid divergirem.
- Impedir merge de modelo novo sem migration.

## Critérios para nota 10

- ~~`pg_stat_ssl=true` com verificação adequada.~~ — critério **substituído**: `pg_stat_ssl` provou
  ser um sinal não confiável no Neon (artefato de proxy); o critério real é "`\conninfo`/tentativa de
  `sslmode=disable` confirmam TLS obrigatório", ✅ satisfeito.
- ✅ Runtime sem capacidade de criar role, banco, tabela ou migration.
- ✅ `refresh_token` coberto por migration, testes e Mermaid.
- ✅ Drift metadata × schema × documentação igual a zero (`diff_metadata_vs_banco` → `[]` no Neon).
- ✅ Busca CNES dentro do SLO acordado no pior caso (0,32ms, muito abaixo de qualquer SLO razoável).
- ⬜ Backup, retenção, RPO/RTO e restore testado com evidência — pendente, ciclo devops.
- ✅ Migrations separadas do boot e protegidas por aprovação (`migrar_banco.yml`).
- ⬜ CI reconstrói banco, testa up/down, constraints e drift — pendente, aguarda CI de backend existir.
- ⬜ Dados de desenvolvimento/teste são sintéticos ou anonimizados — segue não implementado (fora do
  escopo deste Plan Mode; estratégia de clonagem/ingestão documentada em `CLAUDE.md` relativiza o
  risco, não o resolve).

## Estratégia de ingestão e clonagem (decisão do usuário, 2026-09-16)

Complementa o achado de volume (`cnes_estabelecimento` com 635.113 linhas,
`convenio` com 403) e a divergência local×Neon relatada acima: nesta mesma
sessão o Neon recebeu, pela primeira vez, a carga completa de
`cnes_estabelecimento` (sync via parquet S3) e de `convenio` (403 linhas,
CNES resolvido em 357 delas — 267 `cnpj_exato`, 71 `planilha`, 7 `manual`,
7 `cnpj_multi_municipio`, 5 `nome_endereco`, 46 sem match). A migration de
FK física de CNES só aplicou depois de corrigir dado sujo pré-existente em
`instrumento_equipamento.cnes` (`'NA'` e valores sem zero-padding) e de
sincronizar `cnes_estabelecimento` — nenhuma dessas duas correções está
coberta por teste ou script permanente hoje, ficou resolvida manualmente
nesta sessão.

A partir disso o usuário definiu a estratégia de dados do Neon canônico,
que deve ser incorporada ao Plan Mode antes de fechar esta área:

- **Migração de servidor é `pg_dump`/`pg_restore` do Neon, não
  reingestão.** Decisão explícita: ao mudar de servidor/produção, clona-se
  o banco inteiro em vez de reprocessar planilha/CNPJ/JSON. Isso relativiza
  parcialmente o achado "dados pessoais e ambientes" (P1) — não substitui
  a necessidade de dataset sintético/anonimizado para desenvolvimento, mas
  estabelece que o Neon (não os scripts) é a fonte de verdade a ser clonada.
- **Dado "congelado" (clona e não reimporta)** — passou por decisão
  humana/validação pontual ou é estatística oficial sem cadência própria;
  reimportar reescreveria correção feita a mão no sistema:
  - `instrumento_equipamento` (`importar_planilha_monitoramento.py`, já
    documentado como bootstrap único).
  - `convenio.cnes`/`cnes_metodo` (`importar_convenios_banco.py` — os
    357/403 resolvidos nesta sessão). Correção futura de CNES errado é
    edição pelo técnico via PATCH, não replanilhar.
  - `accelerator_row`, `municipality_population_row`, `inca_estimate`
    (`importar_aceleradores.py`, `importar_populacao_municipios.py`,
    `importar_inca_estimates.py`) — estatística oficial ANS/INCA versionada
    em `data/raw/`, sem API viva. Só reimporta por decisão explícita da
    equipe ao chegar arquivo oficial mais novo, nunca automaticamente.
- **Dado "vivo" (clonar sozinho não basta)** — instrumento/proposta novo
  continua trazendo esse dado depois de qualquer clone congelado:
  - `cnes_estabelecimento`, via `sincronizar_cnes_referencia.py` (parquet
    S3, precisa credencial AWS) e `sincronizar_cnes_referencia_api.py`
    (ElastiCNES, sem credencial, criado nesta sessão para desbloquear a FK
    sem depender do S3 — cobre só CNES já presentes no índice de
    equipamentos).
  - `job_descoberta_transferegov.py` (novas propostas do Radar de
    Convênios).

Pendente de decisão formal (Plan Mode): onde/com que frequência roda o
`pg_dump`/`pg_restore` de migração de servidor, e como esse clone se
concilia com o Bloco 4 (backup/retenção/RPO/RTO) e com a necessidade de
dataset sintético para desenvolvimento já apontada acima.

## Veredito

### Original (2026-09-16)

O conteúdo do Neon está íntegro e os agregados de negócio estão corretos. Os
riscos estão na fronteira operacional: conexão sem SSL observada, role
excessivamente privilegiada e evolução do modelo sem migration. Esses três
itens precisam ser resolvidos antes de considerar o database fechado em
produção.

### Atualização 2026-09-17

Os três itens que bloqueavam o fechamento foram resolvidos e reconfirmados contra o Neon real: a
conexão sempre foi criptografada de ponta a ponta (achado original era leitura equivocada de
`pg_stat_ssl`, não um gap); o runtime roda hoje com `sigeo_runtime`, sem `CREATEDB`/`CREATEROLE`, e
migrations rodam com `sigeo_migration` isolado; `refresh_token` está migrado e sem drift. Junto
disso, o Bloco 3 (trigram CNES) também foi resolvido, e o Bloco 4 (migration acoplada ao boot/jobs)
foi desacoplado. `diff_metadata_vs_banco` retorna `[]` no Neon — zero divergência entre código e
schema aplicado.

O que resta aberto é conscientemente fora do escopo deste Plan Mode: backup/retenção/RPO-RTO
(ciclo devops), CI de backend com gate de drift (aguarda CI existir) e dataset sintético/anonimizado
para desenvolvimento (relativizado pela estratégia de clonagem via `pg_dump`/`pg_restore`
documentada em `CLAUDE.md`, mas não resolvido). Nenhum desses três bloqueia produção da forma que os
itens originais bloqueavam — são lacunas de processo/observabilidade, não de integridade ou
segurança de acesso ao dado. Avaliação atualizada: **9,3/10**.
