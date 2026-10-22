"""Um teto de segurança não pode transformar exportação parcial em sucesso."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert

from app.db.base import SessionLocal, get_db
from app.domain_errors import ValidationError
from app.main import app
from app.repositories.limites_relatorio import LimiteConsultaExcedido
from app.services.relatorios import FiltroRelatorio, montar_relatorio
from tests.fixtures_relatorios_limites import MODELOS, TETOS, consultar_lote, criar_lote_limite, linha_limite


@pytest.fixture
def lote_limite(request):
    with SessionLocal() as db:
        origem = request.param
        exec_id = criar_lote_limite(db, origem)
        try:
            yield db, origem, exec_id
        finally:
            db.rollback()


@pytest.mark.parametrize("lote_limite", TETOS, indirect=True)
def test_teto_exato_e_aceito_mas_excesso_nao_retorna_lista_parcial(lote_limite):
    # Given: teto real completo, sem diminuir configuração para facilitar teste.
    db, origem, exec_id = lote_limite
    assert len(consultar_lote(db, origem, exec_id)) == TETOS[origem]
    db.execute(insert(MODELOS[origem]), [linha_limite(origem, TETOS[origem], exec_id)])
    # When / Then
    with pytest.raises(LimiteConsultaExcedido):
        consultar_lote(db, origem, exec_id)
    if origem != "macros":
        with pytest.raises(LimiteConsultaExcedido):
            consultar_lote(db, origem, exec_id, municipio="AAAA sintético")


@pytest.mark.parametrize("lote_limite", ["convenios", "propostas", "municipios"], indirect=True)
def test_municipio_e_aplicado_antes_do_teto_sem_perder_linha_final(lote_limite):
    # Given: o único município correspondente vem depois do antigo corte.
    db, origem, exec_id = lote_limite
    db.execute(insert(MODELOS[origem]), [linha_limite(origem, TETOS[origem], exec_id, municipio="SAO PAULO")])
    # When
    registros = consultar_lote(db, origem, exec_id, municipio="São Paulo")
    # Then
    assert len(registros) == 1
    assert (registros[0].municipality_name if origem == "municipios" else registros[0].municipio) == "SAO PAULO"


@pytest.mark.parametrize("lote_limite", TETOS, indirect=True)
@pytest.mark.parametrize("formato", ["xlsx", "docx"])
def test_geracao_recusa_excesso_em_vez_de_entregar_arquivo_incompleto(lote_limite, formato):
    # Given
    db, origem, exec_id = lote_limite
    db.execute(insert(MODELOS[origem]), [linha_limite(origem, TETOS[origem], exec_id)])
    # When / Then
    with pytest.raises(ValidationError, match="Refine os filtros"):
        montar_relatorio(
            db=db,
            formato=formato,
            nivel="completo" if origem == "municipios" else "simplificado",
            tipo_relatorio="analise_merito" if origem in {"macros", "municipios"} else "instrumentos_repasse",
            filtro=FiltroRelatorio(escopo="uf", uf="AC"),
        )


@pytest.mark.parametrize("lote_limite", ["macros"], indirect=True)
@pytest.mark.parametrize("formato", ["xlsx", "docx"])
def test_http_excesso_e_422_sem_anexo_parcial(lote_limite, formato, headers_autenticados, monkeypatch):
    # Given: SQL real compartilhado com a requisição, sessão autenticada real.
    db, origem, exec_id = lote_limite
    db.execute(insert(MODELOS[origem]), [linha_limite(origem, TETOS[origem], exec_id)])
    monkeypatch.setitem(app.dependency_overrides, get_db, lambda: db)
    # When
    with TestClient(app) as client:
        resposta = client.get(
            "/relatorios",
            headers=headers_autenticados,
            params={
                "formato": formato,
                "tipo_relatorio": "analise_merito",
                "escopo": "uf",
                "uf": "AC",
            },
        )
    # Then: erro padronizado, sem arquivo ou stack trace ao usuário.
    assert resposta.status_code == 422
    assert resposta.headers["content-type"] == "application/json"
    assert "content-disposition" not in resposta.headers
    assert resposta.json() == {
        "error": "O recorte excede o limite seguro de exportação. Refine os filtros e gere o relatório novamente.",
        "detail": None,
    }
