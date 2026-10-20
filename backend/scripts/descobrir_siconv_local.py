"""Entrada local protegida, sem cron, deploy ou leitura implícita de .env."""

import argparse
import os

from scripts.descoberta_local_guardas import validar_ambiente, validar_destino


def executar(*, limite: int = 1000, baseline_silenciosa: bool = False) -> None:
    if type(limite) is not int or not 1 <= limite <= 1000:
        raise ValueError("Limite local deve estar entre 1 e 1000.")
    if type(baseline_silenciosa) is not bool:
        raise ValueError("Modo baseline deve ser booleano explícito.")
    destino = validar_ambiente(os.environ)
    # Guardas precedem os imports que constroem Settings/engine do app.
    from app.db.base import engine
    from scripts.job_descoberta_siconv import run

    validar_destino(
        engine.url.render_as_string(hide_password=True), permitir_teste=bool(os.environ.get("TEST_DATABASE_URL"))
    )
    if (engine.url.host, engine.url.port or 5432, engine.url.database) != destino:
        raise ValueError("Conexão carregada difere do destino local autorizado.")
    run(limite=limite, baseline_silenciosa=baseline_silenciosa)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limite", type=int, default=1000)
    parser.add_argument(
        "--baseline-silenciosa", action="store_true", help="Registrar a carga inicial sem avisos de novidade."
    )
    args = parser.parse_args()
    try:
        executar(limite=args.limite, baseline_silenciosa=args.baseline_silenciosa)
    except Exception:
        # Não expor URL de banco, chave do Portal ou exceção de fonte externa.
        parser.exit(1, "Descoberta local não concluída. Verifique o ambiente isolado e as fontes.\n")


if __name__ == "__main__":
    main()
