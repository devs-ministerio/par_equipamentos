-- Entrega a posse dos objetos do schema public a sigeo_migration.
--
-- Por que existe: só o dono de uma tabela ou de um tipo enum pode alterá-lo. Em
-- produção, objetos criados depois da separação de roles (tabelas
-- evidencia_transferegov, instrumento_responsavel e notificacao_destinatario,
-- suas sequências e os 11 tipos enum) ficaram com neondb_owner, e
-- sigeo_migration (que não herda de neondb_owner) não consegue aplicar
-- ALTER TABLE nem ALTER TYPE ... ADD VALUE sobre eles. As migrations falham com
-- "must be owner of ...".
--
-- Só muda DONO: não altera dados, senhas nem permissões já concedidas. Idempotente.
-- Rode como a role administrativa do banco (no Neon, neondb_owner) em uma
-- transação única, ANTES de `alembic upgrade head`:
--   psql "$ADMIN_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f normalizar_posse_aplicacao.sql
-- Em produção, só depois de um backup íntegro e com autorização explícita.
-- Exige PostgreSQL 16 ou superior e que a role sigeo_migration já exista.
\set ON_ERROR_STOP on

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sigeo_migration') AS migration_existe,
       (current_setting('server_version_num')::int >= 160000) AS versao_ok \gset
\if :migration_existe
\else
  \echo 'A role sigeo_migration não existe; crie as roles primeiro (recriar_roles_banco.sh).'
  \quit 3
\endif
\if :versao_ok
\else
  \echo 'Exige PostgreSQL 16 ou superior.'
  \quit 3
\endif

-- Antes: quantos objetos do schema public não pertencem a sigeo_migration.
SELECT (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND c.relowner <> 'sigeo_migration'::regrole)
     + (SELECT count(*) FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace
          AND t.typtype = 'e' AND t.typowner <> 'sigeo_migration'::regrole) AS fora_antes \gset
\echo 'Objetos fora de sigeo_migration antes:' :fora_antes

-- Quem executa precisa poder atribuir donos a sigeo_migration, e o novo dono
-- precisa de CREATE no schema para receber a posse.
SELECT format('GRANT sigeo_migration TO %I WITH INHERIT FALSE, SET TRUE', current_user)
WHERE NOT pg_has_role(current_user, 'sigeo_migration', 'SET') \gexec
GRANT USAGE, CREATE ON SCHEMA public TO sigeo_migration;

-- Tabelas (levam consigo as sequências ligadas a colunas), depois sequências
-- independentes, tipos enum e funções do schema (objetos de extensão ficam de fora).
SELECT format('ALTER TABLE %I.%I OWNER TO sigeo_migration', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND c.relowner <> 'sigeo_migration'::regrole
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
\gexec

SELECT format('ALTER SEQUENCE %I.%I OWNER TO sigeo_migration', n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relowner <> 'sigeo_migration'::regrole
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i'))
\gexec

SELECT format('ALTER TYPE %I.%I OWNER TO sigeo_migration', n.nspname, t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typowner <> 'sigeo_migration'::regrole
\gexec

SELECT format('ALTER FUNCTION %s OWNER TO sigeo_migration', p.oid::regprocedure)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p') AND p.proowner <> 'sigeo_migration'::regrole
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
\gexec

-- Depois: tem que ser zero.
SELECT (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND c.relowner <> 'sigeo_migration'::regrole)
     + (SELECT count(*) FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace
          AND t.typtype = 'e' AND t.typowner <> 'sigeo_migration'::regrole) AS fora_depois \gset
\echo 'Objetos fora de sigeo_migration depois:' :fora_depois
\if :fora_depois
  \echo 'Ainda há objetos fora de sigeo_migration; revise antes de migrar.'
  \quit 1
\endif
