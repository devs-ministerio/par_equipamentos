"""Popula a evidência relacional a partir do adaptador JSON compatível.

Executar uma única vez, com ``DATABASE_URL`` apontando ao banco alvo, após a
migration ``b7e3d9f4a621``. É idempotente: nós cujo hash não mudou não são
reescritos. Não consulta a API nem altera decisões de revisão das propostas.
"""

from __future__ import annotations

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import PropostaCandidata
from app.services.evidencias_transferegov import registrar_evidencias_relacionais


def run() -> None:
    total_propostas = 0
    total_nos = 0
    with SessionLocal() as db:
        propostas = db.execute(select(PropostaCandidata).where(PropostaCandidata.metas_resumo.is_not(None))).scalars()
        for proposta in propostas:
            detalhe = proposta.metas_resumo
            if detalhe is None:
                continue
            total_nos += registrar_evidencias_relacionais(
                db,
                proposta_candidata_id=proposta.id,
                detalhe=detalhe,
            )
            total_propostas += 1
        db.commit()
    print(f"Concluído: {total_nos} nó(s) de evidência em {total_propostas} proposta(s).")


if __name__ == "__main__":
    run()
