"""Models declaram FK/CHECK do bloco 7 mesmo sem banco."""
from __future__ import annotations

from app.db.models import CnesEstabelecimento, Convenio, EquipmentOfferRow, InstrumentoEquipamento, PropostaCandidata


def test_models_declaram_fk_cnes_com_ondelete_set_null():
    for modelo in (Convenio, InstrumentoEquipamento, PropostaCandidata):
        fks = list(modelo.__table__.c.cnes.foreign_keys)
        assert len(fks) == 1
        assert fks[0].column.table.name == "cnes_estabelecimento"
        assert fks[0].ondelete == "SET NULL"
        assert fks[0].onupdate == "RESTRICT"


def test_models_declaram_checks_de_coordenada_e_formato():
    nomes = {c.name for c in getattr(CnesEstabelecimento.__table__, "constraints") if getattr(c, "name", None)}
    assert "ck_cnes_estabelecimento_cnes_formato" in nomes
    assert "ck_cnes_estabelecimento_latitude" in nomes
    assert "ck_cnes_estabelecimento_longitude" in nomes

    eor = {c.name for c in getattr(EquipmentOfferRow.__table__, "constraints") if getattr(c, "name", None)}
    assert "ck_equipment_offer_row_latitude" in eor
    assert "ck_equipment_offer_row_existing_qty" in eor
