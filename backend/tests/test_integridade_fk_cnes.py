"""Constraint de banco rejeita CNES orfao -- regressao do bloco 7."""
from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.base import SessionLocal
from app.db.models import Convenio


@pytest.mark.db
def test_banco_rejeita_convenio_com_cnes_orfao():
    db = SessionLocal()
    try:
        convenio = db.query(Convenio).order_by(Convenio.numero).first()
        if convenio is None:
            pytest.skip("sem convenio no banco de teste")

        original = convenio.cnes
        convenio.cnes = "0000000"  # 7 digitos, mas fora de cnes_estabelecimento
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        db.refresh(convenio)
        assert convenio.cnes == original
    finally:
        db.close()


@pytest.mark.db
def test_banco_rejeita_latitude_cnes_invalida():
    from app.db.models import CnesEstabelecimento

    db = SessionLocal()
    try:
        est = db.query(CnesEstabelecimento).order_by(CnesEstabelecimento.cnes).first()
        if est is None:
            pytest.skip("sem cnes_estabelecimento no banco de teste")

        original = est.latitude
        est.latitude = 999
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        db.refresh(est)
        assert est.latitude == original
    finally:
        db.close()
