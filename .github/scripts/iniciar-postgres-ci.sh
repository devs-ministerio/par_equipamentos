#!/usr/bin/env bash
# Cluster novo no runner descartável: NAT Docker não satisfaz inet_server_addr().
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "$(uname -s)" != Linux ]]; then
  echo 'PostgreSQL de CI exige runner Linux hospedado e descartável do GitHub.' >&2
  exit 1
fi
if [[ "${POSTGRES_DB:-}" != sigeo_test_clone_20000101 || "${POSTGRES_USER:-}" != postgres || -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo 'Destino sintético ou credencial do CI ausente.' >&2
  exit 1
fi
if [[ -z "${RUNNER_TEMP:-}" || ! -d "$RUNNER_TEMP" || -z "${GITHUB_PATH:-}" ]]; then
  echo 'Diretórios do runner ausentes.' >&2
  exit 1
fi

binarios=/usr/lib/postgresql/16/bin
if [[ ! -x "$binarios/initdb" ]]; then
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends postgresql-16 postgresql-client-16
fi

umask 077
cluster=$(mktemp -d "$RUNNER_TEMP/sigeo-ci-pg16-XXXXXX")
printf '%s\n' "$POSTGRES_PASSWORD" > "$cluster/senha"
"$binarios/initdb" -D "$cluster/dados" --username="$POSTGRES_USER" \
  --auth-local=scram-sha-256 --auth-host=scram-sha-256 --pwfile="$cluster/senha" > "$cluster/initdb.log"
# Porta exclusiva de CI; nunca reinicia, substitui ou encerra servidor existente.
"$binarios/pg_ctl" -D "$cluster/dados" -l "$cluster/postgres.log" \
  -o "-h 127.0.0.1 -p 5433 -k $cluster" -w start
export PGPASSWORD="$POSTGRES_PASSWORD"
"$binarios/createdb" --host=127.0.0.1 --port=5433 --username="$POSTGRES_USER" "$POSTGRES_DB"
"$binarios/pg_isready" --host=127.0.0.1 --port=5433 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
"$binarios/psql" --host=127.0.0.1 --port=5433 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --no-psqlrc --set=ON_ERROR_STOP=1 --command='SELECT version(), inet_server_addr(), inet_server_port();'
printf '%s\n' "$binarios" >> "$GITHUB_PATH"
# O runner efêmero descarta o cluster ao encerrar o job; não publicar seus logs/senha.
