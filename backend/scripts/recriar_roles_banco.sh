#!/usr/bin/env bash
# Recria as roles da aplicação num banco RESTAURADO e verifica as permissões.
#
# Uso (destino de recuperação, nunca a produção viva):
#   export ADMIN_DATABASE_URL='postgresql://ADMIN:SENHA@HOST/BANCO?sslmode=require'
#   export SIGEO_RUNTIME_PASSWORD=... SIGEO_MIGRATION_PASSWORD=... SIGEO_BACKUP_PASSWORD=...
#   backend/scripts/recriar_roles_banco.sh --confirmo-host HOST
#
# As senhas novas (>= 24 caracteres, distintas) devem ser registradas depois nos
# secrets e no Render (DATABASE_URL = sigeo_runtime, DATABASE_URL_MIGRATION =
# sigeo_migration, BACKUP_DATABASE_URL = sigeo_backup). Nada é impresso.
set -euo pipefail

aqui=$(cd "$(dirname "$0")" && pwd)
host_confirmado=""
while [ $# -gt 0 ]; do
  case "$1" in
    --confirmo-host) host_confirmado="${2:-}"; shift 2 ;;
    *) echo "Uso: $0 --confirmo-host HOST" >&2; exit 2 ;;
  esac
done
for nome in ADMIN_DATABASE_URL SIGEO_RUNTIME_PASSWORD SIGEO_MIGRATION_PASSWORD SIGEO_BACKUP_PASSWORD; do
  [ -n "${!nome:-}" ] || { echo "Variável ausente: $nome" >&2; exit 2; }
done

# Decompõe a URL sem expor a senha; a conferência de host evita rodar no banco errado.
read -r host porta banco sslmode < <(python3 -I - <<'PY'
import os, sys
from urllib.parse import urlsplit, parse_qs
u = urlsplit(os.environ["ADMIN_DATABASE_URL"])
if u.scheme not in ("postgresql", "postgres") or not u.hostname or not u.path.strip("/"):
    sys.exit("ADMIN_DATABASE_URL inválida.")
q = parse_qs(u.query)
print(u.hostname, u.port or 5432, u.path.strip("/"), q.get("sslmode", ["require"])[0])
PY
)
if [ -z "$host_confirmado" ] || [ "$host_confirmado" != "$host" ]; then
  echo "Destino: host=$host banco=$banco" >&2
  echo "Confirme com --confirmo-host $host (apenas para um banco restaurado)." >&2
  exit 2
fi
echo "Destino confirmado: host=$host banco=$banco"

psql_admin() { psql "$ADMIN_DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }
psql_como() { # $1 = role, $2 = senha; SQL em stdin
  PGPASSWORD="$2" PGSSLMODE="$sslmode" psql --no-psqlrc -v ON_ERROR_STOP=1 -q -At -h "$host" -p "$porta" -U "$1" -d "$banco" -f -
}

psql_admin --quiet -f "$aqui/sql/recriar_roles_aplicacao.sql"

falhas=0
confere() { # $1 = descrição; $2 = resultado esperado; $3 = obtido
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (esperado: $2, obtido: $3)"; falhas=$((falhas + 1)); fi
}

echo "--- atributos e posse (administrador)"
confere "roles sem privilégios elevados" "0" "$(psql_admin -At -c "select count(*) from pg_roles where rolname in ('sigeo_migration','sigeo_runtime','sigeo_backup') and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)")"
confere "tabelas do schema public sem dono sigeo_migration" "0" "$(psql_admin -At -c "select count(*) from pg_tables where schemaname='public' and tableowner <> 'sigeo_migration'")"
confere "tipos enum sem dono sigeo_migration" "0" "$(psql_admin -At -c "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e' and pg_get_userbyid(t.typowner) <> 'sigeo_migration'")"
confere "sigeo_backup limitado a 2 conexões" "2" "$(psql_admin -At -c "select rolconnlimit from pg_roles where rolname='sigeo_backup'")"

echo "--- sigeo_runtime (só DML)"
confere "lê dados" "t" "$(psql_como sigeo_runtime "$SIGEO_RUNTIME_PASSWORD" <<<"select count(*) >= 0 from public.alembic_version")"
confere "tem INSERT/UPDATE/DELETE nas tabelas" "t" "$(psql_como sigeo_runtime "$SIGEO_RUNTIME_PASSWORD" <<<"select bool_and(has_table_privilege('sigeo_runtime', format('public.%I', tablename), 'INSERT,UPDATE,DELETE')) from pg_tables where schemaname='public'")"
confere "CREATE TABLE negado" "negado" "$(psql_como sigeo_runtime "$SIGEO_RUNTIME_PASSWORD" <<<"do \$\$ begin begin execute 'create table public.__verificacao_roles(x int)'; raise exception 'permitido'; exception when insufficient_privilege then null; end; end \$\$; select 'negado'" 2>&1 | tail -1)"

echo "--- sigeo_migration (DDL)"
confere "cria e altera tabela (revertido)" "ok" "$(psql_como sigeo_migration "$SIGEO_MIGRATION_PASSWORD" <<<"begin; create table public.__verificacao_roles(x int); alter table public.__verificacao_roles add column y int; alter table public.alembic_version add column __v int; rollback; select 'ok'" 2>&1 | tail -1)"

echo "--- sigeo_backup (somente leitura)"
confere "lê dados" "t" "$(psql_como sigeo_backup "$SIGEO_BACKUP_PASSWORD" <<<"select count(*) >= 0 from public.alembic_version")"
confere "não tem INSERT" "f" "$(psql_como sigeo_backup "$SIGEO_BACKUP_PASSWORD" <<<"select bool_or(has_table_privilege('sigeo_backup', format('public.%I', tablename), 'INSERT,UPDATE,DELETE')) from pg_tables where schemaname='public'")"
confere "transação somente leitura por padrão" "on" "$(psql_como sigeo_backup "$SIGEO_BACKUP_PASSWORD" <<<"show default_transaction_read_only")"

if [ "$falhas" -ne 0 ]; then echo "$falhas verificação(ões) falharam." >&2; exit 1; fi
echo "Todas as verificações passaram."
