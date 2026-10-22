-- Recria as roles da aplicação e as permissões depois de restaurar um backup.
--
-- O backup é restaurado com `pg_restore --no-owner --no-privileges`, então o
-- banco chega sem dono e sem GRANTs. Este script reproduz o desenho do Plan
-- Mode database 2026-09-16 (privilégio mínimo):
--   sigeo_migration  dona das tabelas, sequências e tipos; único com DDL.
--   sigeo_runtime    só DML (SELECT/INSERT/UPDATE/DELETE); sem DDL.
--   sigeo_backup     somente leitura, 2 conexões, timeouts curtos.
--
-- Senhas NUNCA ficam aqui: entram pelo ambiente do psql (\getenv), sem aparecer
-- na linha de comando. Rode com a role administrativa do destino (no Neon,
-- `neondb_owner`), conectada ao banco restaurado. Não rode contra a produção
-- viva: ele redefine senhas e donos. Veja backend/scripts/recriar_roles_banco.sh.
--
-- Idempotente: pode ser repetido. Exige PostgreSQL 16 ou superior.
\set ON_ERROR_STOP on

\getenv runtime_pw SIGEO_RUNTIME_PASSWORD
\getenv migration_pw SIGEO_MIGRATION_PASSWORD
\getenv backup_pw SIGEO_BACKUP_PASSWORD
\if :{?runtime_pw}
\else
  \echo 'Defina SIGEO_RUNTIME_PASSWORD, SIGEO_MIGRATION_PASSWORD e SIGEO_BACKUP_PASSWORD.'
  \quit 3
\endif
\if :{?migration_pw}
\else
  \echo 'Defina SIGEO_MIGRATION_PASSWORD.'
  \quit 3
\endif
\if :{?backup_pw}
\else
  \echo 'Defina SIGEO_BACKUP_PASSWORD.'
  \quit 3
\endif
SELECT (length(:'runtime_pw') >= 24 AND length(:'migration_pw') >= 24 AND length(:'backup_pw') >= 24
        AND :'runtime_pw' <> :'migration_pw' AND :'runtime_pw' <> :'backup_pw'
        AND :'migration_pw' <> :'backup_pw') AS senhas_ok,
       (current_setting('server_version_num')::int >= 160000) AS versao_ok \gset
\if :senhas_ok
\else
  \echo 'As três senhas devem ter ao menos 24 caracteres e ser diferentes entre si.'
  \quit 3
\endif
\if :versao_ok
\else
  \echo 'Exige PostgreSQL 16 ou superior.'
  \quit 3
\endif

BEGIN;

-- 1. Roles sem privilégios elevados.
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', r)
FROM unnest(ARRAY['sigeo_migration', 'sigeo_runtime', 'sigeo_backup']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

SELECT format('ALTER ROLE sigeo_migration PASSWORD %L', :'migration_pw') \gexec
SELECT format('ALTER ROLE sigeo_runtime PASSWORD %L', :'runtime_pw') \gexec
SELECT format('ALTER ROLE sigeo_backup PASSWORD %L', :'backup_pw') \gexec

-- sigeo_backup: leitura apenas, poucas conexões, comandos curtos.
ALTER ROLE sigeo_backup CONNECTION LIMIT 2;
ALTER ROLE sigeo_backup SET default_transaction_read_only = on;
ALTER ROLE sigeo_backup SET lock_timeout = '5s';
ALTER ROLE sigeo_backup SET statement_timeout = '5min';

-- 2. Quem executa precisa poder atribuir donos a sigeo_migration.
SELECT format('GRANT sigeo_migration TO %I WITH INHERIT FALSE, SET TRUE', current_user)
WHERE NOT pg_has_role(current_user, 'sigeo_migration', 'SET') \gexec

-- O novo dono precisa de CREATE no schema para receber a posse (ALTER ... OWNER TO).
GRANT USAGE, CREATE ON SCHEMA public TO sigeo_migration;

-- 3. Posse: tabelas, depois sequências independentes, tipos enum e funções do
-- schema public (objetos de extensão ficam de fora). Tabelas levam consigo as
-- sequências ligadas a colunas (serial/identity).
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

-- 4. Permissões no banco e no schema (a role administrativa é dona delas).
-- PUBLIC não cria objetos no schema; só sigeo_migration.
SELECT format('GRANT CONNECT ON DATABASE %I TO sigeo_migration, sigeo_runtime, sigeo_backup', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO sigeo_runtime, sigeo_backup;

-- 5. Permissões em tabelas e sequências: quem pode concedê-las agora é a dona
-- (sigeo_migration), então as concessões rodam sob essa role.
SET ROLE sigeo_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sigeo_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sigeo_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO sigeo_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO sigeo_backup;

-- Objetos criados depois por migration já nascem com essas permissões.
ALTER DEFAULT PRIVILEGES FOR ROLE sigeo_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sigeo_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sigeo_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO sigeo_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sigeo_migration IN SCHEMA public
  GRANT SELECT ON TABLES TO sigeo_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE sigeo_migration IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO sigeo_backup;
RESET ROLE;

COMMIT;
\echo 'Roles e permissões recriadas.'
