"""Worker pontual de escopo histórico, exclusivamente em clone local validado."""

import argparse
import os
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from scripts.recaptura_legado_guardas import conferir_conexao_carregada, validar_ambiente_recaptura

if TYPE_CHECKING:
    from sqlalchemy.orm import Session, sessionmaker


def revalidar_candidato(*, db: "Session", candidato_id: int, fabrica_sessao: "sessionmaker[Session]") -> int:
    from app.services.capturas_fonte import registrar_captura
    from app.services.revalidacao_legado import preparar_revalidacao, registrar_inelegibilidade
    from scripts.coletar_escopo_legado import coletar_escopo

    if type(candidato_id) is not int or candidato_id <= 0:
        raise ValueError("Informe um único identificador positivo de candidato.")
    alvo = preparar_revalidacao(db=db, candidato_id=candidato_id)
    inicio = datetime.now(UTC)
    try:
        escopo = coletar_escopo(alvo)
    except Exception:
        db.rollback()
        registrar_captura("siconv_revalidacao", iniciado_em=inicio, status="erro", fabrica_sessao=fabrica_sessao)
        raise
    return registrar_inelegibilidade(db=db, alvo=alvo, escopo=escopo)


def executar(*, candidato_id: int) -> None:
    if type(candidato_id) is not int or candidato_id <= 0:
        raise ValueError("Informe um único identificador positivo de candidato.")
    if len(os.environ.get("JWT_SECRET", "")) < 32 or os.environ.get("NEW_RELIC_ENABLED", "").casefold() != "false":
        raise ValueError("Configuração local explícita obrigatória; telemetria externa desabilitada.")
    validar_ambiente_recaptura(os.environ)
    from app.db.base import SessionLocal, engine

    conferir_conexao_carregada(engine.url.render_as_string(hide_password=True), os.environ)
    with SessionLocal() as db:
        revalidar_candidato(db=db, candidato_id=candidato_id, fabrica_sessao=SessionLocal)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidato-id", type=int, required=True)
    args = parser.parse_args()
    try:
        executar(candidato_id=args.candidato_id)
    except Exception:
        parser.exit(1, "Revalidação não publicada. Confira o Radar e o histórico de fontes.\n")
