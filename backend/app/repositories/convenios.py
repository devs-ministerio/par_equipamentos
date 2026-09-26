"""Acesso a dados de Convenio para os relatorios (Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Bloco 2).

Separado da query de `app/routers/convenios.py::_aplicar_filtros_convenio`
de proposito -- essa e paginada e filtra por busca/equipamento/situacao/ano/
programa (uso de UI), o relatorio precisa do universo inteiro que bate o
filtro geografico (uf/municipio/cnes/regiao), sem paginacao. Função solta
com `db: Session` posicional, mesmo contrato de app/repositories/monitoramento.py.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Convenio

# Teto de seguranca do relatorio -- nao paginacao de UI (mesmo espirito do
# Bloco 4 do Plan Mode consolidacao 2026-09-17). 581 convenios hoje, bem
# abaixo disso.
LIMITE_RELATORIO = 5000


def listar_convenios_filtrados(
    db: Session,
    *,
    ufs: list[str] | None = None,
    municipio: str | None = None,
    cnes: str | None = None,
) -> list[Convenio]:
    stmt = select(Convenio)
    if ufs:
        stmt = stmt.where(Convenio.uf.in_(ufs))
    if municipio:
        stmt = stmt.where(Convenio.municipio == municipio)
    if cnes:
        stmt = stmt.where(Convenio.cnes == cnes)
    stmt = stmt.order_by(Convenio.numero).limit(LIMITE_RELATORIO)
    return list(db.execute(stmt).scalars().all())
