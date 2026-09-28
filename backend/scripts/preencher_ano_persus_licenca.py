"""Preenche o ano PERSUS I pela licença de operação vigente.

Fonte aprovada pela equipe em 2026-09-28: evento interno do marco
``regulatorio_licenca_operacao``. Não substitui anos já preenchidos e mantém
Convenio/InstrumentoEquipamento consistentes para o mesmo identificador.
"""

from __future__ import annotations

import argparse

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio, EventoMarco, InstrumentoEquipamento, MarcoCatalogo


def executar(*, dry_run: bool) -> dict[str, int]:
    db = SessionLocal()
    try:
        eventos = db.execute(
            select(EventoMarco, InstrumentoEquipamento.nr_convenio)
            .join(InstrumentoEquipamento, InstrumentoEquipamento.id == EventoMarco.instrumento_id)
            .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
            .where(
                InstrumentoEquipamento.tipo_contratacao == "PERSUS I",
                MarcoCatalogo.codigo == "regulatorio_licenca_operacao",
                EventoMarco.data_ocorrencia.is_not(None),
                EventoMarco.substituido_por_id.is_(None),
                EventoMarco.deletado_em.is_(None),
            )
        ).all()
        anos_por_numero = {numero: evento.data_ocorrencia.year for evento, numero in eventos if evento.data_ocorrencia}
        resultado = {"convenios": 0, "instrumentos": 0, "sem_licenca": 0}
        convenios = db.execute(
            select(Convenio).where(Convenio.tipo_contratacao == "PERSUS I", Convenio.ano_instrumento.is_(None))
        ).scalars()
        for convenio in convenios:
            ano = anos_por_numero.get(convenio.numero)
            if ano is None:
                resultado["sem_licenca"] += 1
                continue
            convenio.ano_instrumento = ano
            resultado["convenios"] += 1
        instrumentos = db.execute(
            select(InstrumentoEquipamento).where(
                InstrumentoEquipamento.tipo_contratacao == "PERSUS I",
                InstrumentoEquipamento.ano_instrumento.is_(None),
            )
        ).scalars()
        for instrumento in instrumentos:
            ano = anos_por_numero.get(instrumento.nr_convenio)
            if ano is None:
                continue
            instrumento.ano_instrumento = ano
            resultado["instrumentos"] += 1
        if dry_run:
            db.rollback()
        else:
            db.commit()
        return resultado
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(executar(dry_run=args.dry_run))
