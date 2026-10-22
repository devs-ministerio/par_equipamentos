"""Launcher de teste: app real em filho, somente SQL sintético e loopback."""

import json
import resource
import socket
import sys
from pathlib import Path

import uvicorn
from sqlalchemy.engine import make_url

from app.config import settings
from tests.recursos_servidor import pico_rss_servidor


class ServidorMedido(uvicorn.Server):
    async def shutdown(self, sockets: list[socket.socket] | None = None) -> None:
        await super().shutdown(sockets=sockets)
        uso = resource.getrusage(resource.RUSAGE_SELF)
        pico_rss, fonte_rss = pico_rss_servidor()
        Path(sys.argv[2]).write_text(
            json.dumps(
                {
                    "rss_pico_servidor_bytes": pico_rss,
                    "rss_pico_servidor_fonte": fonte_rss,
                    "rss_rusage_bruto_bytes": uso.ru_maxrss if sys.platform == "darwin" else uso.ru_maxrss * 1024,
                    "cpu_usuario_segundos": uso.ru_utime,
                    "cpu_sistema_segundos": uso.ru_stime,
                }
            ),
            encoding="utf-8",
        )


if __name__ == "__main__":
    url = make_url(settings.database_url_normalizada)
    if url.host != "127.0.0.1" or not (url.database or "").startswith("sigeo_test_migrations_"):
        raise SystemExit("Launcher exige banco filho sintético em loopback.")
    ServidorMedido(
        uvicorn.Config(
            "app.main:app", fd=int(sys.argv[1]), access_log=False, log_level="warning", timeout_graceful_shutdown=20
        )
    ).run()
