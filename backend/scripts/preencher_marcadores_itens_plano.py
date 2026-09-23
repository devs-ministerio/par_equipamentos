"""Backfill one-shot de marcadores ausentes a partir dos itens do plano.

Não faz inferência por CNPJ, programa ou componente. Registros sem item de
plano continuam no relatório para saneamento da fonte. Roda em simulação por
padrão; ``--aplicar`` exige revisão prévia do relatório de auditoria.
"""

import argparse

from sqlalchemy import func, select

from app.db.base import SessionLocal
from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.equipamentos import classificar_descricoes, extrair_descricoes
from app.services.equipamento_marcadores import DadosMarcador, registrar_marcadores


def executar(*, limite: int | None = None, aplicar: bool = False) -> dict[str, int]:
    resultado = {"convenios_com_itens": 0, "marcadores_criados": 0, "sem_item_plano": 0}
    with SessionLocal() as db:
        consulta = (
            select(Convenio)
            .outerjoin(EquipamentoMarcador, EquipamentoMarcador.convenio_id == Convenio.id)
            .group_by(Convenio.id)
            .having(func.count(EquipamentoMarcador.id) == 0)
            .order_by(Convenio.numero)
        )
        if limite is not None:
            consulta = consulta.limit(limite)
        convenios = db.execute(consulta).scalars().all()
        catalogo = {
            item.codigo: item for item in db.execute(select(EquipamentoCatalogo)).scalars()
        }
        for convenio in convenios:
            descricoes = extrair_descricoes(convenio.siconv_raw, {"DESCRICAO_ITEM", "descricao_item"})
            evidencias = classificar_descricoes(descricoes)
            if not evidencias:
                resultado["sem_item_plano"] += 1
                continue
            resultado["convenios_com_itens"] += 1
            resultado["marcadores_criados"] += registrar_marcadores(
                db=db,
                origem="convenio",
                origem_id=convenio.id,
                marcadores=[
                    DadosMarcador(
                        evidencia=evidencia,
                        tipo_evidencia="item_orcamentario",
                        confianca=100,
                        origem_dado=convenio.origem_dado,
                    )
                    for evidencia in evidencias
                ],
                catalogo=catalogo,
            )
        if aplicar:
            db.commit()
        else:
            db.rollback()
    print(("APLICADO" if aplicar else "SIMULAÇÃO") + ": " + str(resultado))
    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limite", type=int)
    parser.add_argument("--aplicar", action="store_true", help="persiste o backfill após revisão")
    args = parser.parse_args()
    executar(limite=args.limite, aplicar=args.aplicar)
