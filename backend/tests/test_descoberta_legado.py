"""Descoberta exata e confirmação externa, sem banco ou API real."""

from zipfile import ZipFile

import pytest
from pydantic import ValidationError

from app.pipeline.portal_transparencia import ConvenioPortalTransparencia
from app.repositories.descoberta_legado import ler_snapshot_csv
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado, confirmar_no_portal


def novo_candidato(numero="123456", proposta="1"):
    evidencia = EvidenciaLegado(
        id_item="10", codigo_equipamento="acelerador_linear", descricao="Aquisição de LINAC", relacao="aquisicao"
    )
    return CandidatoLegado(numero=numero, id_proposta=proposta, evidencias=(evidencia,))


@pytest.mark.parametrize("publicacao", ["2026-10-01", "01/10/2026"])
def test_confirmacao_exige_identidade_exata_e_publicacao(publicacao):
    candidato = novo_candidato()
    portal = ConvenioPortalTransparencia.model_validate(
        {
            "dimConvenio": {"codigo": "123456", "numero": "1/2026", "objeto": "Aquisição de LINAC"},
            "dataPublicacao": publicacao,
        }
    )
    confirmado = confirmar_no_portal(candidato, portal)
    assert confirmado.confirmacao_portal == "confirmado"
    assert confirmado.data_publicacao is not None
    assert confirmado.data_publicacao.isoformat() == "2026-10-01"
    assert candidato.confirmacao_portal == "nao_consultado"  # imutável


def test_portal_ausente_sem_data_ou_identidade_divergente_nunca_confirma():
    candidato = novo_candidato()
    assert confirmar_no_portal(candidato, None).confirmacao_portal == "nao_encontrado"
    identidade = {"codigo": 123456, "numero": "1/2026", "objeto": "Aquisição de LINAC"}
    sem_data = ConvenioPortalTransparencia.model_validate({"dimConvenio": identidade})
    assert confirmar_no_portal(candidato, sem_data).confirmacao_portal == "sem_publicacao"
    errado = ConvenioPortalTransparencia.model_validate({"dimConvenio": {**identidade, "codigo": 123457}})
    with pytest.raises(ValueError, match="identidade diferente"):
        confirmar_no_portal(candidato, errado)
    with pytest.raises(ValidationError):
        confirmar_no_portal(candidato, ConvenioPortalTransparencia())


@pytest.mark.parametrize("campo", ["numero", "objeto"])
@pytest.mark.parametrize("valor", [None, "", "   "])
def test_portal_com_codigo_e_data_confirma_mesmo_sem_numero_ou_objeto(campo, valor):
    # Formato observado no aceite nacional de 19/10 (7AAFSX). Confirmar só consome
    # codigo e dataPublicacao; o contrato completo é exigido na recaptura e na aprovação.
    candidato = novo_candidato(numero="7AAFSX")
    identidade = {"codigo": "7AAFSX", "numero": "1/2026", "objeto": "Aquisição de LINAC", campo: valor}
    portal = ConvenioPortalTransparencia.model_validate({"dimConvenio": identidade, "dataPublicacao": "01/10/2026"})
    confirmado = confirmar_no_portal(candidato, portal)
    assert confirmado.confirmacao_portal == "confirmado"
    assert candidato.confirmacao_portal == "nao_consultado"


@pytest.mark.parametrize("campo", ["numero", "objeto"])
@pytest.mark.parametrize("valor", [None, "", "   "])
def test_contrato_completo_do_portal_continua_exigindo_numero_e_objeto(campo, valor):
    from app.schemas_portal_legado import DimConvenioPortal

    identidade = {"codigo": "7AAFSX", "numero": "1/2026", "objeto": "Aquisição de LINAC", campo: valor}
    with pytest.raises(ValidationError):
        DimConvenioPortal.model_validate(identidade)


def test_portal_sem_codigo_nao_confirma():
    candidato = novo_candidato()
    portal = ConvenioPortalTransparencia.model_validate(
        {"dimConvenio": {"numero": "1/2026", "objeto": "x"}, "dataPublicacao": "01/10/2026"}
    )
    with pytest.raises(ValidationError):
        confirmar_no_portal(candidato, portal)


def test_snapshot_zip_preserva_texto_com_ponto_e_virgula_e_bom(tmp_path):
    caminho = tmp_path / "fonte.zip"
    with ZipFile(caminho, "w") as arquivo:
        arquivo.writestr("fonte.csv", '\ufeffID_PROPOSTA;ID_ITEM_PAD;DESCRICAO_ITEM\n1;10;"LINAC; aquisição"\n')
    assert list(ler_snapshot_csv(caminho, colunas={"ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"})) == [
        {"ID_PROPOSTA": "1", "ID_ITEM_PAD": "10", "DESCRICAO_ITEM": "LINAC; aquisição"}
    ]


@pytest.mark.parametrize("csv", ["X\n1\n", "ID_PROPOSTA;ID_PROPOSTA\n1;1\n", "ID_PROPOSTA;NR_CONVENIO\n1\n"])
def test_snapshot_incompleto_ou_ambiguo_nao_e_ignorado(csv, tmp_path):
    caminho = tmp_path / "fonte.zip"
    with ZipFile(caminho, "w") as arquivo:
        arquivo.writestr("fonte.csv", csv)
    with pytest.raises(ValueError):
        list(ler_snapshot_csv(caminho, colunas={"ID_PROPOSTA", "NR_CONVENIO"}))


def test_zip_com_varios_csv_nao_escolhe_primeiro_silenciosamente(tmp_path):
    caminho = tmp_path / "fonte.zip"
    with ZipFile(caminho, "w") as arquivo:
        arquivo.writestr("a.csv", "ID_PROPOSTA;NR_CONVENIO\n1;123456\n")
        arquivo.writestr("b.csv", "ID_PROPOSTA;NR_CONVENIO\n2;234567\n")
    with pytest.raises(ValueError, match="exatamente um"):
        list(ler_snapshot_csv(caminho, colunas={"ID_PROPOSTA", "NR_CONVENIO"}))
