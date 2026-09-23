from __future__ import annotations

from types import SimpleNamespace

from app.db.models import Convenio
from app.routers.convenios import CONVENIO_LIST_LOAD_ONLY, ConvenioRead, _projecao_disponibilidade_dados


def test_listagem_convenios_nao_carrega_payload_cru():
    colunas = {col.key for col in CONVENIO_LIST_LOAD_ONLY}

    assert "siconv_raw" not in colunas
    assert "transferegov_raw" not in colunas


def test_listagem_convenios_projeta_todos_os_campos_do_schema_resumo():
    colunas = {col.key for col in CONVENIO_LIST_LOAD_ONLY}
    # ``equipamentos`` é projeção relacional em lote, não coluna de
    # convenio; o restante do resumo precisa continuar no load_only.
    campos_schema = set(ConvenioRead.model_fields) - {
        "cnes_nome_estabelecimento",
        "equipamentos",
        "dados_oficiais_disponiveis",
        "desembolso_integral_da_carga",
    }

    assert campos_schema <= colunas


def test_detalhe_convenio_continua_tendo_payload_cru_no_model():
    assert hasattr(Convenio, "siconv_raw")
    assert hasattr(Convenio, "transferegov_raw")


def test_carga_manual_projeta_desembolso_integral_sem_dados_oficiais():
    convenio = SimpleNamespace(tipo_contratacao="FAF", valor_global=125_000.0, valor_desembolsado=None)

    resultado = _projecao_disponibilidade_dados(convenio)

    assert resultado == {
        "dados_oficiais_disponiveis": False,
        "valor_desembolsado": 125_000.0,
        "desembolso_integral_da_carga": True,
    }


def test_convenio_oficial_preserva_desembolso_extraido_da_fonte():
    convenio = SimpleNamespace(tipo_contratacao="Convênio", valor_global=125_000.0, valor_desembolsado=60_000.0)

    resultado = _projecao_disponibilidade_dados(convenio)

    assert resultado == {
        "dados_oficiais_disponiveis": True,
        "valor_desembolsado": 60_000.0,
        "desembolso_integral_da_carga": False,
    }
