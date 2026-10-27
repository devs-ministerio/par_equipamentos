"""Uma resposta incompleta do Portal não confirma nem aborta outros candidatos."""

from datetime import UTC, datetime

import pytest
import requests

from app.pipeline.portal_transparencia import ConvenioPortalTransparencia
from app.services.capturas_fonte import CapturaEmAndamento
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado
from scripts import job_descoberta_siconv


def candidato_sintetico(numero: str) -> CandidatoLegado:
    return CandidatoLegado(
        numero=numero,
        id_proposta=numero,
        evidencias=(
            EvidenciaLegado(
                id_item=numero, codigo_equipamento="tomografo", descricao="Aquisição de tomógrafo", relacao="aquisicao"
            ),
        ),
    )


def portal_sintetico(numero: str, *, completo: bool = True) -> ConvenioPortalTransparencia:
    return ConvenioPortalTransparencia.model_validate(
        {
            "dimConvenio": {
                "codigo": numero,
                "numero": "1/2026" if completo else "",
                "objeto": "Aquisição de tomógrafo" if completo else "",
            },
            "dataPublicacao": "01/10/2026",
            "campo_ignorado": "valor-que-nao-deve-ir-ao-diagnostico",
        }
    )


def test_lote_isola_contrato_incompleto_e_preserva_confirmacao_estrita(monkeypatch):
    # Arrange: só a fronteira HTTP é substituída; o contrato roda real.
    candidatos = [candidato_sintetico(n) for n in ("123456", "123457", "123458")]
    respostas = {c.numero: portal_sintetico(c.numero, completo=c.numero != "123457") for c in candidatos}
    monkeypatch.setattr(
        job_descoberta_siconv, "buscar_convenio_por_numero_dto", lambda numero, session: respostas[numero]
    )
    rodada = CapturaEmAndamento(fonte="siconv_descoberta", iniciado_em=datetime.now(UTC))
    # Act
    with requests.Session() as sessao:
        resultado = job_descoberta_siconv.confirmar_candidatos(candidatos, sessao=sessao, rodada=rodada)
    # Assert
    assert [c.numero for c in resultado] == ["123456", "123458"]
    assert all(c.confirmacao_portal == "confirmado" for c in resultado)
    assert all(c.confirmacao_portal == "nao_consultado" for c in candidatos)
    assert rodada.parcial == "1 candidato(s) sem confirmação íntegra do Portal; não publicados nesta rodada."
    assert rodada.detalhes["confirmacoes_inconclusivas"][0]["numero"] == "123457"
    assert "valor-que-nao-deve-ir-ao-diagnostico" not in str(rodada.detalhes)


def test_identidade_divergente_continua_abortando_o_lote(monkeypatch):
    # Arrange
    monkeypatch.setattr(
        job_descoberta_siconv, "buscar_convenio_por_numero_dto", lambda numero, session: portal_sintetico("654321")
    )
    rodada = CapturaEmAndamento(fonte="siconv_descoberta", iniciado_em=datetime.now(UTC))
    # Act / Assert
    with requests.Session() as sessao, pytest.raises(ValueError, match="identidade diferente"):
        job_descoberta_siconv.confirmar_candidatos([candidato_sintetico("123456")], sessao=sessao, rodada=rodada)
    assert rodada.detalhes == {}
