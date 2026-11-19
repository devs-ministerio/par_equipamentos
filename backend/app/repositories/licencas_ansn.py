"""Acesso a dados da licença de operação da ANSN (instalações e vínculos com o CNES). Funções soltas, sem commit."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    CnesEstabelecimento,
    EquipamentoCatalogo,
    InstalacaoAnsn,
    ItemPlano,
    VinculoLicencaEstabelecimento,
)

LIMITE = 20_000


def codigos_exigidos_por_instrumento(db: Session, instrumento_ids: list[int]) -> dict[int, set[str]]:
    """Famílias que exigem licença nos itens ativos de cada instrumento."""
    if not instrumento_ids:
        return {}
    resultado: dict[int, set[str]] = {}
    linhas = db.execute(
        select(ItemPlano.instrumento_id, EquipamentoCatalogo.codigo)
        .join(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
        .where(
            ItemPlano.instrumento_id.in_(instrumento_ids),
            ItemPlano.ativo.is_(True),
            EquipamentoCatalogo.exige_licenca.is_(True),
        )
    )
    for instrumento_id, codigo in linhas:
        resultado.setdefault(int(instrumento_id), set()).add(codigo)
    return resultado


def ultima_carga(db: Session) -> date | None:
    return db.scalar(select(func.max(InstalacaoAnsn.consultado_em)))


def vinculos_por_cnes(
    db: Session, cnes: list[str]
) -> dict[str, list[tuple[VinculoLicencaEstabelecimento, InstalacaoAnsn | None]]]:
    """Vínculos ativos de cada CNES, com a instalação da ANSN quando a matrícula consta na base."""
    if not cnes:
        return {}
    resultado: dict[str, list[tuple[VinculoLicencaEstabelecimento, InstalacaoAnsn | None]]] = {}
    linhas = db.execute(
        select(VinculoLicencaEstabelecimento, InstalacaoAnsn)
        .outerjoin(InstalacaoAnsn, InstalacaoAnsn.matricula == VinculoLicencaEstabelecimento.matricula)
        .where(VinculoLicencaEstabelecimento.cnes.in_(cnes), VinculoLicencaEstabelecimento.deletado_em.is_(None))
        .order_by(VinculoLicencaEstabelecimento.cnes, VinculoLicencaEstabelecimento.matricula)
        .limit(LIMITE)
    )
    for vinculo, instalacao in linhas:
        resultado.setdefault(vinculo.cnes, []).append((vinculo, instalacao))
    return resultado


def instalacoes_por_matricula(db: Session, matriculas: list[str]) -> dict[str, InstalacaoAnsn]:
    if not matriculas:
        return {}
    return {
        i.matricula: i for i in db.scalars(select(InstalacaoAnsn).where(InstalacaoAnsn.matricula.in_(matriculas)))
    }


def cnes_existentes(db: Session, cnes: list[str]) -> set[str]:
    if not cnes:
        return set()
    return set(db.scalars(select(CnesEstabelecimento.cnes).where(CnesEstabelecimento.cnes.in_(cnes))))


def vinculos_ativos(db: Session) -> set[tuple[str, str]]:
    return {
        (c, m)
        for c, m in db.execute(
            select(VinculoLicencaEstabelecimento.cnes, VinculoLicencaEstabelecimento.matricula).where(
                VinculoLicencaEstabelecimento.deletado_em.is_(None)
            )
        )
    }
