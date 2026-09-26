"""app/geo_reference.py -- mapa oficial UF -> grande regiao para os relatorios
(Plan Mode docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 1)."""

from __future__ import annotations

from sqlalchemy import Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from app.geo_reference import (
    REGIAO_POR_UF,
    REGIOES,
    expressao_regiao_por_uf,
    regiao_da_uf,
    ufs_da_regiao,
)


def test_todas_as_27_ufs_estao_mapeadas():
    assert len(REGIAO_POR_UF) == 27


def test_regioes_sao_as_5_grandes_regioes_do_brasil():
    assert REGIOES == ["Centro-Oeste", "Nordeste", "Norte", "Sudeste", "Sul"]


def test_regiao_da_uf_aceita_minusculo():
    assert regiao_da_uf("sp") == "Sudeste"
    assert regiao_da_uf("SP") == "Sudeste"


def test_regiao_da_uf_desconhecida_e_none():
    assert regiao_da_uf("XX") is None


def test_ufs_da_regiao_norte():
    assert ufs_da_regiao("Norte") == ["AC", "AM", "AP", "PA", "RO", "RR", "TO"]


def test_ufs_da_regiao_desconhecida_e_lista_vazia():
    assert ufs_da_regiao("Atlantida") == []


class _Base(DeclarativeBase):
    pass


class _Local(_Base):
    __tablename__ = "geo_reference_teste"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uf: Mapped[str] = mapped_column(String(2))


def test_expressao_regiao_por_uf_traduz_em_sql():
    engine = create_engine("sqlite:///:memory:")
    _Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([_Local(uf="SP"), _Local(uf="BA"), _Local(uf="ZZ")])
        db.commit()

        expressao = expressao_regiao_por_uf(_Local.uf).label("regiao")
        linhas = db.execute(select(_Local.uf, expressao)).all()
        resultado: dict[str, str | None] = {uf: regiao for uf, regiao in linhas}

    assert resultado["SP"] == "Sudeste"
    assert resultado["BA"] == "Nordeste"
    assert resultado["ZZ"] is None
