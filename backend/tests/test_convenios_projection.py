from __future__ import annotations

from app.db.models import Convenio
from app.routers.convenios import CONVENIO_LIST_LOAD_ONLY, ConvenioRead


def test_listagem_convenios_nao_carrega_payload_cru():
    colunas = {col.key for col in CONVENIO_LIST_LOAD_ONLY}

    assert "siconv_raw" not in colunas
    assert "transferegov_raw" not in colunas


def test_listagem_convenios_projeta_todos_os_campos_do_schema_resumo():
    colunas = {col.key for col in CONVENIO_LIST_LOAD_ONLY}
    campos_schema = set(ConvenioRead.model_fields) - {"cnes_nome_estabelecimento"}

    assert campos_schema <= colunas


def test_detalhe_convenio_continua_tendo_payload_cru_no_model():
    assert hasattr(Convenio, "siconv_raw")
    assert hasattr(Convenio, "transferegov_raw")
