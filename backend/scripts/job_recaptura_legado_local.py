"""Recaptura um candidato local; nunca aprova ou inicia monitoramento.

Uso: ambiente explícito e validado, python -m scripts.job_recaptura_legado_local
--candidato-id N. Não lê arquivo .env implicitamente antes das guardas.
"""

import argparse
import os
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from scripts.recaptura_legado_guardas import (
    conferir_conexao_carregada,
    validar_ambiente_recaptura,
    validar_configuracao_coleta,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session, sessionmaker

    from app.schemas_recaptura_persistencia import RecapturaPersistida


def recapturar_candidato(
    *, db: "Session", candidato_id: int, fabrica_sessao: "sessionmaker[Session]"
) -> "RecapturaPersistida":
    """Kernel com sessão dedicada; usado após validação do destino pelo launcher."""
    from app.schemas_recaptura_persistencia import ReferenciaRecaptura
    from app.services.capturas_fonte import registrar_captura
    from app.services.recapturas_legado import preparar_alvo_coleta, registrar_recaptura
    from scripts.coletar_recaptura_legado import coletar_recaptura

    if type(candidato_id) is not int or candidato_id <= 0:
        raise ValueError("Informe um único identificador positivo de candidato.")
    alvo = preparar_alvo_coleta(db=db, candidato_id=candidato_id)
    inicio = datetime.now(UTC)
    try:
        pacote = coletar_recaptura(alvo)
    except Exception:
        db.rollback()
        registrar_captura("siconv_recaptura", iniciado_em=inicio, status="erro", fabrica_sessao=fabrica_sessao)
        raise
    return registrar_recaptura(
        db=db,
        referencia=ReferenciaRecaptura(candidato_id=alvo.candidato_id, captura_id=alvo.captura_id),
        captura=pacote.captura,
        origem=pacote.origem,
    )


def executar(*, candidato_id: int) -> None:
    if type(candidato_id) is not int or candidato_id <= 0:
        raise ValueError("Informe um único identificador positivo de candidato.")
    validar_configuracao_coleta(os.environ)
    validar_ambiente_recaptura(os.environ)
    from app.db.base import SessionLocal, engine

    conferir_conexao_carregada(engine.url.render_as_string(hide_password=True), os.environ)
    # Não mantém transação aberta durante rede; somente falhas de coleta
    # geram alerta de fonte. Conflitos de revisão não são indisponibilidade.
    with SessionLocal() as db:
        recapturar_candidato(db=db, candidato_id=candidato_id, fabrica_sessao=SessionLocal)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidato-id", type=int, required=True)
    args = parser.parse_args()
    try:
        executar(candidato_id=args.candidato_id)
    except Exception:
        print("Recaptura não publicada. Confira o Radar e o histórico de fontes; nenhum dado privado foi exibido.")
        raise SystemExit(1) from None
