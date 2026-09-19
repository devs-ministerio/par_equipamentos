
# Constituição Database IA v1.0

## 1. Filosofia do Projeto

Este documento define as regras obrigatórias para qualquer modelagem, migração ou query de
banco de dados realizada por IA. Complementa [constituicao_backend.md](../backend/constituicao_backend.md)
(camada Repository é a única autorizada a executar query direta) e
[constituicao_seguranca.md](../seguranca/constituicao_seguranca.md) (dado sensível, query parametrizada,
segredo/credencial de conexão).

### Objetivos

- Schema previsível, íntegro e evolutivo — mudança de estrutura nunca quebra dado existente.
- Modelagem que reflete o domínio real, não a conveniência do primeiro endpoint que a consumiu.
- Padronização entre todos os projetos (PostgreSQL/Oracle para OLTP, Parquet/DuckDB para OLAP), sem
  "gambiarra de schema" que pareça gerado sem contexto de negócio ("cara de IA" no banco = tabela sem
  chave estrangeira, coluna `data`/`info`/`json` fuga de modelagem, migração sem rollback, índice
  ausente em coluna de filtro/join óbvio).

---

## 2. PLAN MODE (Obrigatório)

Antes de criar/alterar qualquer schema, migração ou query analítica não trivial, a IA apresenta um
plano contendo:

### Objetivo

- O que muda (nova tabela, nova coluna, novo índice, nova relação).
- Motivo de negócio (qual funcionalidade/consulta exige a mudança).

### Modelagem

- Entidades e relacionamentos afetados (diagrama textual ou lista de FKs).
- Tipo de dado de cada coluna nova, com justificativa (não "o que sobrar").
- Normalização aplicada, ou motivo explícito de desnormalização (performance de leitura comprovada).

### Migração

- Script de `up` e `down` (rollback sempre possível).
- Impacto em dado existente: backfill necessário? Coluna nova é `NOT NULL` sem default em tabela com
  linhas? Rename que quebra consumidor?
- Janela de execução: pode rodar online (sem lock longo) ou exige manutenção?

### Performance

- Índice novo necessário (coluna de filtro, join, ordenação frequente).
- Volume estimado da tabela (afeta escolha de índice, particionamento, OLTP vs. OLAP).

### Riscos

- Breaking change de contrato para o backend consumidor (coluna removida/renomeada/tipo alterado).
- Lock de tabela em produção durante migração (tabela grande, `ALTER TABLE` bloqueante).
- Perda de dado irreversível (`DROP COLUMN`, `TRUNCATE`).

A implementação só começa após aprovação do plano.

### Formato do Plano

- Conciso, em bullet points, **no máximo 30-40 linhas**.
- Sem SQL completo no plano — apenas estrutura lógica, decisões e nomes de tabela/coluna.

---

## 3. Modelagem de Schema

### Normalização como Padrão

- Modelagem relacional segue normalização até 3FN por padrão. Desnormalização só é aceita com
  justificativa explícita de performance medida (não suposição) — e documentada no schema (comentário
  de tabela/migração).

### Chaves e Integridade

- Toda tabela tem chave primária explícita (`id` serial/UUID — nunca tabela sem PK).
- Todo relacionamento é uma foreign key real com `ON DELETE`/`ON UPDATE` explícitos (`CASCADE`,
  `RESTRICT`, `SET NULL` — nunca deixado no default silencioso sem decisão consciente).
- Constraint de domínio no banco, não só na aplicação: `NOT NULL`, `UNIQUE`, `CHECK` para invariantes
  que nunca podem ser violadas (ex.: `valor >= 0`, `status IN (...)`).

### Tipagem de Coluna

- Tipo mais estrito e específico disponível: `DATE`/`TIMESTAMP` para data (nunca `VARCHAR`), `NUMERIC`
  para valor monetário (nunca `FLOAT`), `ENUM`/`CHECK` para estado finito (nunca `VARCHAR` livre para
  status).
- Proibido coluna `json`/`jsonb` como escape para "não modelar" um relacionamento ou atributo que tem
  estrutura conhecida e consultável.

### Nomenclatura

| Elemento | Padrão | Exemplo |
|---|---|---|
| Tabela | `snake_case`, plural | `convenios`, `usuarios` |
| Coluna | `snake_case`, singular | `valor_total`, `criado_em` |
| Chave primária | `id` | `id` |
| Chave estrangeira | `<entidade_singular>_id` | `convenio_id`, `usuario_id` |
| Índice | `idx_<tabela>_<coluna(s)>` | `idx_convenios_status` |
| Constraint única | `uq_<tabela>_<coluna(s)>` | `uq_usuarios_email` |
| Tabela de junção N:N | `<entidade_a>_<entidade_b>` | `convenios_tags` |

Nunca misturar `snake_case` e `camelCase` no mesmo schema. Colunas de auditoria padrão em toda
tabela transacional: `criado_em`, `atualizado_em` (e `deletado_em` se soft delete for adotado).

### Soft Delete vs. Hard Delete

- Adotar soft delete (`deletado_em`) apenas quando há requisito de negócio/auditoria explícito.
  Quando adotado, toda query de leitura filtra `deletado_em IS NULL` por padrão — nunca deixar a
  aplicação responsável por lembrar disso caso a caso sem view/constraint que ajude a garantir.

---

## 4. Migrações

### Obrigatório

- Toda alteração de schema é uma migração versionada (ferramenta do stack: Prisma Migrate, Alembic,
  Flyway, Knex) — nunca alteração manual direto em produção.
- Migração é reversível: script de `down` implementado e testado, mesmo quando o rollback é "recriar
  a partir do backup" para caso destrutivo (documentar explicitamente).
- Migração aditiva (nova coluna nullable, nova tabela) é preferida a migração destrutiva em produção
  com dado ativo. Renomear/remover coluna usada em produção segue expand-contract: (1) adiciona nova
  coluna, (2) migra/backfill dado, (3) aplicação passa a usar a nova, (4) remove a antiga em migração
  separada.

### Proibido

- `DROP TABLE`/`DROP COLUMN`/`TRUNCATE` sem plano aprovado e sem confirmação de backup recente.
- Migração que faz `ALTER TABLE` bloqueante em tabela grande sem avaliar estratégia online
  (`CONCURRENTLY` no Postgres, batching de backfill).
- Editar migração já aplicada em ambiente compartilhado — sempre uma nova migração corretiva.

---

## 5. Queries e Performance

### Índices

- Toda coluna usada em `WHERE`, `JOIN` ou `ORDER BY` com frequência tem índice correspondente,
  avaliado no momento da modelagem — não só quando a query fica lenta em produção.
- Índice composto segue a ordem de seletividade/uso real da query (coluna mais filtrada primeiro),
  não a ordem "que ficou mais fácil de escrever".
- Sem índice redundante (dois índices que cobrem o mesmo prefixo de coluna sem necessidade).

### Queries Explícitas

- Proibido `SELECT *` em query de aplicação — projeção de coluna sempre explícita (alinhado com a
  Constituição Backend).
- Query parametrizada (prepared statement) em 100% dos casos — nunca concatenar valor de usuário em
  SQL (alinhado com a Constituição de Segurança).
- Evitar N+1: relação carregada via `JOIN`/`IN` batelado, nunca query dentro de loop da aplicação.

### Separação OLTP / OLAP

| Tipo de operação | Onde | Ferramenta |
|---|---|---|
| Transacional (cadastro, status, autenticação) | Banco relacional | PostgreSQL/Oracle |
| Agregado/métrica em volume alto (SICONV, DataSUS, Transferegov) | Arquivo colunar | Parquet via DuckDB/Polars |

- Query analítica pesada (agregação sobre milhões de linhas) não roda direto contra o banco
  transacional de produção — usa réplica, warehouse ou extração colunar dedicada.

### Transações

- Operação que altera múltiplas tabelas de forma dependente é sempre uma transação (`BEGIN`/`COMMIT`
  com `ROLLBACK` em erro) — nunca múltiplos `INSERT`/`UPDATE` isolados que podem deixar dado
  inconsistente se um falhar no meio.
- Nível de isolamento explícito quando o padrão do banco não é suficiente para o caso (ex.: evitar
  race condition em saldo/contagem concorrente).

### Paginação

- Toda query que retorna lista para a aplicação é paginada na origem (`LIMIT`/`OFFSET` ou cursor) —
  nunca trazer tabela inteira para paginar em memória na aplicação.

---

## 6. Segurança e Dados Sensíveis

> Política completa em [constituicao_seguranca.md](../seguranca/constituicao_seguranca.md). Esta
> seção é o checklist mínimo de aplicação no banco.

- [ ] Credencial de conexão só via `.env`/secret manager, nunca hardcoded, nunca versionada.
- [ ] Coluna com dado sensível (CPF, dado financeiro pessoal, credencial) identificada explicitamente
      (comentário de coluna ou convenção de nome) para orientar mascaramento/log na aplicação.
- [ ] Dado sensível em ambiente de desenvolvimento/teste é sintético ou anonimizado — nunca cópia crua
      de produção sem mascaramento.
- [ ] Usuário de aplicação no banco tem permissão mínima necessária (sem `SUPERUSER`/`DBA` em conexão
      de runtime da API).
- [ ] Backup de banco com dado sensível segue a mesma política de retenção/acesso do dado original.

---

## 7. Backup e Recuperação

- Backup automatizado e testado (restore validado periodicamente, não só "o job rodou sem erro").
- Retenção de backup definida por criticidade do dado (financeiro/auditoria retém mais tempo que
  dado operacional transiente).
- Migração destrutiva em produção exige backup pontual (snapshot) imediatamente anterior, confirmado
  antes da execução.

---

## 8. Código Limpo e Eficiência (Anti "Cara de IA")

O equivalente, no banco, a uma UI genérica é: tabela sem relacionamento real (tudo em `jsonb`), coluna
`status VARCHAR` livre sem `CHECK`/`ENUM`, migração sem `down`, e índice criado "por via das dúvidas"
em toda coluna sem analisar a query real.

### Nunca

- Coluna `data`/`info`/`json`/`metadata` genérica quando o atributo tem estrutura conhecida e merece
  coluna/tabela própria.
- Relacionamento resolvido em `jsonb`/array de IDs em vez de tabela de junção com FK real.
- Migração que só tem `up`, sem `down` implementado.
- Nome de tabela/coluna em inglês misturado com português no mesmo schema, ou abreviação obscura
  (`cnv`, `tbl_usr`) em vez do termo de domínio por extenso.
- Índice criado em toda coluna sem analisar plano de execução (`EXPLAIN`) da query real.

### Sempre

- Nome de tabela/coluna no termo de domínio real, em português consistente com o resto do projeto.
- `EXPLAIN ANALYZE` (ou equivalente) antes de considerar uma query de alto volume pronta.
- Constraint de banco (`NOT NULL`, `CHECK`, `UNIQUE`, FK) como fonte de verdade da integridade — a
  validação da aplicação é defesa adicional, não substituta.
- Migração testada localmente (`up` e `down`) antes de aplicar em ambiente compartilhado.

---

## 9. Testes

> Política completa em [constituicao_qualidade.md](../qualidade/constituicao_qualidade.md). Esta
> seção é o resumo de aplicação no banco.

### Obrigatório

- Migração testada em ambiente local/CI antes de produção (`up` aplica limpo, `down` reverte limpo).
- Teste de integração para query com lógica não trivial (filtro composto, agregação, paginação) —
  alinhado com a camada Repository da Constituição Backend.
- Constraint de integridade (FK, `CHECK`, `UNIQUE`) coberta por teste que confirma que a violação é
  rejeitada pelo banco, não só pela aplicação.

### Proibido

- Teste que roda só contra mock de banco quando a lógica testada depende de comportamento real do SQL
  (constraint, transação, `JOIN` complexo).

---

## 10. Fluxo de Implementação

1. Modelagem (entidades, relacionamentos, tipos, constraints).
2. Plano de migração (`up`/`down`, estratégia online se aplicável).
3. Migração aplicada em ambiente local/CI.
4. Índices definidos com base na query real esperada.
5. Testes de integração e de constraint.
6. Validação e aplicação em produção com backup prévio.

### Validação obrigatória

```bash
# Exemplo (ajustar à ferramenta do stack)
npx prisma migrate dev        # ou: alembic upgrade head / flyway migrate
npm run test:integration      # ou: pytest -m integration
EXPLAIN ANALYZE <query crítica>
```

---

## 11. Checklist de Entrega

- [ ] Plano de modelagem/migração aprovado.
- [ ] Toda tabela com PK; todo relacionamento com FK real (`ON DELETE`/`ON UPDATE` explícitos).
- [ ] Tipo de coluna estrito (sem `VARCHAR` para data/enum/dinheiro, sem `jsonb` de escape).
- [ ] Constraint de domínio (`NOT NULL`, `CHECK`, `UNIQUE`) aplicada no banco, não só na aplicação.
- [ ] Nomenclatura consistente (`snake_case`, convenção de tabela/coluna/índice/FK).
- [ ] Migração com `up` e `down`, testada localmente antes de produção.
- [ ] Migração destrutiva com backup pontual confirmado antes da execução.
- [ ] Índice definido com base em query real (`EXPLAIN`), sem redundância.
- [ ] Query da aplicação sem `SELECT *`, parametrizada, sem N+1, paginada.
- [ ] Operação multi-tabela dentro de transação.
- [ ] Coluna sensível identificada; dado sintético/anonimizado em dev/teste.
- [ ] Credencial de conexão só via `.env`/secret manager.
- [ ] Testes de integração e de constraint escritos e passando.

---

## Prompt de Referência

Atue como Senior Database Architect. Siga rigorosamente esta Constituição de Database:

1. Modele com chave primária, foreign key real e constraints de domínio no banco — nunca `jsonb`
   como substituto de relacionamento ou `VARCHAR` livre como substituto de `ENUM`/`CHECK`.
2. Toda migração tem `up` e `down`, é testada localmente e segue expand-contract para mudança
   destrutiva em produção com dado ativo.
3. Nunca `SELECT *`; toda query paginada, parametrizada e com índice compatível com o filtro/join
   real, validado via `EXPLAIN`.
4. Operação que altera múltiplas tabelas de forma dependente é sempre uma transação.
5. Nomeie tabela/coluna com termo de domínio real, em `snake_case` consistente, sem abreviação
   obscura.
6. Nunca execute migração destrutiva em produção sem plano aprovado e backup pontual confirmado.
</content>
