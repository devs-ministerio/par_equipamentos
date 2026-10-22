#!/usr/bin/env bash
# Ensaio de restauração do backup cifrado do R2 em PostgreSQL LOCAL e descartável.
#
# Baixa o backup mais recente (ou o objeto informado), confere o SHA-256,
# decifra com a identidade `age` privada, restaura num banco novo e mede o
# tempo total (insumo do RTO). Nunca escreve em produção e recusa qualquer
# destino que não seja um banco novo `sigeo_restore_*` em loopback.
#
# Uso:
#   backend/scripts/restaurar_backup.sh --env ARQUIVO_PRIVADO.env \
#       --identidade ARQUIVO_AGE_PRIVADO [--objeto CHAVE] [--manter]
#
# O arquivo .env (permissão 0600, fora do Git) define:
#   BACKUP_R2_ENDPOINT, BACKUP_R2_BUCKET, AWS_ACCESS_KEY_ID,
#   AWS_SECRET_ACCESS_KEY e, opcionalmente, PGHOST/PGPORT/PGUSER do destino.
# Nada disso é impresso. O relatório final traz só nomes de tabela e contagens.
set -euo pipefail
umask 077

uso() { sed -n '2,17p' "$0" >&2; exit 2; }

arquivo_env=""; identidade=""; objeto=""; manter=0
while [ $# -gt 0 ]; do
  case "$1" in
    --env) arquivo_env="${2:-}"; shift 2 ;;
    --identidade) identidade="${2:-}"; shift 2 ;;
    --objeto) objeto="${2:-}"; shift 2 ;;
    --manter) manter=1; shift ;;
    *) uso ;;
  esac
done
[ -n "$arquivo_env" ] && [ -n "$identidade" ] || uso

permissao_ok() { [ "$(stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1")" = "600" ]; }
for arquivo in "$arquivo_env" "$identidade"; do
  [ -f "$arquivo" ] || { echo "Arquivo inexistente: $arquivo" >&2; exit 1; }
  permissao_ok "$arquivo" || { echo "Permissão de $arquivo deve ser 0600." >&2; exit 1; }
done

set -a
# shellcheck disable=SC1090
. "$arquivo_env"
set +a
for nome in BACKUP_R2_ENDPOINT BACKUP_R2_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [ -n "${!nome:-}" ] || { echo "Variável ausente no arquivo .env: $nome" >&2; exit 1; }
done
export AWS_DEFAULT_REGION=auto AWS_PAGER=""

host="${PGHOST:-127.0.0.1}"
case "$host" in
  127.0.0.1|localhost|::1) ;;
  *) echo "Destino de restauração precisa ser local (loopback)." >&2; exit 1 ;;
esac
export PGHOST="$host"
destino="sigeo_restore_$(date -u +%Y%m%dt%H%M%S)_$$"
[[ "$destino" =~ ^sigeo_restore_[0-9a-z_]+$ ]] || { echo "Nome de destino inválido." >&2; exit 1; }

trabalho=$(mktemp -d)
limpar() {
  find "$trabalho" -type f -exec rm -f {} + 2>/dev/null || true
  rm -rf "$trabalho"
  if [ "$manter" -eq 0 ]; then
    dropdb --if-exists "$destino" >/dev/null 2>&1 || true
  fi
}
trap limpar EXIT

inicio=$(date +%s)
if [ -z "$objeto" ]; then
  aws s3api list-objects-v2 --bucket "$BACKUP_R2_BUCKET" --prefix sigeo/producao/ \
    --endpoint-url "$BACKUP_R2_ENDPOINT" --output json > "$trabalho/lista.json"
  objeto=$(python3 - "$trabalho/lista.json" <<'PY'
import json, sys
itens = json.load(open(sys.argv[1])).get("Contents") or []
chaves = {i["Key"] for i in itens}
validos = [i for i in itens if i["Key"].endswith(".dump.age") and i["Size"] > 0 and i["Key"] + ".sha256" in chaves]
print(max(validos, key=lambda i: i["LastModified"])["Key"] if validos else "")
PY
)
  [ -n "$objeto" ] || { echo "Nenhum backup íntegro encontrado no bucket." >&2; exit 1; }
fi
echo "Objeto: $objeto"

aws s3 cp "s3://$BACKUP_R2_BUCKET/$objeto" "$trabalho/dump.age" --endpoint-url "$BACKUP_R2_ENDPOINT" --only-show-errors
aws s3 cp "s3://$BACKUP_R2_BUCKET/$objeto.sha256" "$trabalho/dump.age.sha256" --endpoint-url "$BACKUP_R2_ENDPOINT" --only-show-errors
esperado=$(tr -d '[:space:]' < "$trabalho/dump.age.sha256")
obtido=$(shasum -a 256 "$trabalho/dump.age" | awk '{print $1}')
[ "$esperado" = "$obtido" ] || { echo "SHA-256 divergente: arquivo adulterado ou incompleto." >&2; exit 1; }
echo "Integridade SHA-256: ok"

age --decrypt --identity "$identidade" --output "$trabalho/dump" "$trabalho/dump.age"
createdb "$destino"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$destino" "$trabalho/dump"
fim=$(date +%s)

echo "Banco restaurado: $destino"
echo "Tempo total (download + decifra + restauração): $((fim - inicio)) s"
echo "Contagem de linhas por tabela (public):"
psql --no-psqlrc --tuples-only --no-align --dbname="$destino" --command="
  SELECT format('SELECT %L, count(*) FROM %I.%I', relname, nspname, relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND nspname = 'public' ORDER BY relname" |
  while IFS= read -r consulta; do
    psql --no-psqlrc --tuples-only --no-align --field-separator=' = ' --dbname="$destino" --command="$consulta"
  done
if [ "$manter" -eq 1 ]; then
  echo "Banco mantido para inspeção: $destino (remova com dropdb)."
else
  echo "Banco temporário será removido."
fi
