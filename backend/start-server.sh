#!/bin/sh
set -eu

# O agente só é ativado quando a chave estiver presente no ambiente do
# provedor. Assim, desenvolvimento local, CI e smoke sem credencial continuam
# sem telemetria externa e sem segredo versionado.
if [ -n "${NEW_RELIC_LICENSE_KEY:-}" ]; then
  exec newrelic-admin run-program uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
