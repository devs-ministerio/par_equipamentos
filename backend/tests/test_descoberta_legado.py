"""Descoberta exata e confirmação externa, sem banco ou API real."""

from zipfile import ZipFile

import pytest
from pydantic import ValidationError

from app.pipeline.portal_transparencia import ConvenioPortalTransparencia
from app.repositories.descoberta_legado import ler_snapshot_csv
from app.services.descoberta_legado import confirmar_no_portal, descobrir_legado


def convenio(proposta="1", numero="123456"):
    return {"ID_PROPOSTA": proposta, "NR_CONVENIO": numero}


def item(proposta="1", identificador="10", descricao="Aquisição de LINAC"):
    return {"ID_PROPOSTA": proposta, "ID_ITEM_PAD": identificador, "DESCRICAO_ITEM": descricao}


def test_descoberta_exclui_conhecidos_e_proposta_sem_convenio_sem_inventar_compra():
    resultado = descobrir_legado(
        [convenio(), convenio("2", "234567")],
        [item(), item("2", descricao="Equipamento existente: mamógrafo"), item("3")],
        conhecidos={"123456"},
    )
    assert len(resultado) == 1 and resultado[0].numero == "234567"
    assert resultado[0].confirmacao_portal == "nao_consultado"
    assert resultado[0].evidencias[0].codigo_equipamento == "mamografo"
    assert resultado[0].evidencias[0].relacao == "existente"


def test_alias_canonico_idempotencia_e_reordenacao():
    registros = [item(), item(identificador="11", descricao="PET-CT"), item()]
    esperado = descobrir_legado([convenio()], registros, conhecidos=set())
    assert descobrir_legado([convenio(), convenio()], reversed(registros), conhecidos=set()) == esperado
    assert {e.codigo_equipamento for e in esperado[0].evidencias} == {"acelerador_linear", "pet_ct"}
    assert len(esperado[0].evidencias) == 2


@pytest.mark.parametrize("registros", [[], [item(descricao="Compra de cadeiras")], [item(descricao="")]])
def test_sem_evidencia_do_catalogo_nao_entra_no_radar(registros):
    assert descobrir_legado([convenio()], registros, conhecidos=set()) == []


def test_vinculo_ambiguo_e_item_divergente_abortam_sem_resultado_parcial():
    with pytest.raises(ValueError, match="ambíguo"):
        descobrir_legado([convenio(), convenio(numero="654321")], [item()], conhecidos=set())
    with pytest.raises(ValueError, match="ambíguo"):
        descobrir_legado([convenio(), convenio(proposta="2")], [item()], conhecidos=set())
    with pytest.raises(ValueError, match="divergentes"):
        descobrir_legado([convenio()], [item(), item(descricao="Mamógrafo")], conhecidos=set())


@pytest.mark.parametrize("registro", [{}, convenio(proposta=""), convenio(numero="FAF-1")])
def test_identidade_ausente_ou_nao_numerica_e_rejeitada(registro):
    with pytest.raises(ValidationError):
        descobrir_legado([registro], [item()], conhecidos=set())


@pytest.mark.parametrize("publicacao", ["2026-10-01", "01/10/2026"])
def test_confirmacao_exige_identidade_exata_e_publicacao(publicacao):
    candidato = descobrir_legado([convenio()], [item()], conhecidos=set())[0]
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
    candidato = descobrir_legado([convenio()], [item()], conhecidos=set())[0]
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
def test_portal_com_codigo_e_data_mas_identidade_incompleta_nao_confirma(campo, valor):
    # Arrange: formato incompleto observado no aceite nacional de 19/10.
    candidato = descobrir_legado([convenio(numero="7AAFSX")], [item()], conhecidos=set())[0]
    identidade = {"codigo": "7AAFSX", "numero": "1/2026", "objeto": "Aquisição de LINAC", campo: valor}
    portal = ConvenioPortalTransparencia.model_validate({"dimConvenio": identidade, "dataPublicacao": "01/10/2026"})
    # Act / Assert: não converter evidência incompleta em confirmação.
    with pytest.raises(ValidationError):
        confirmar_no_portal(candidato, portal)
    assert candidato.confirmacao_portal == "nao_consultado"


@pytest.mark.parametrize("campo", ["numero", "objeto"])
def test_campo_de_identidade_omitido_nao_confirma(campo):
    # Arrange
    candidato = descobrir_legado([convenio()], [item()], conhecidos=set())[0]
    identidade = {"codigo": "123456", "numero": "1/2026", "objeto": "Aquisição de LINAC"}
    del identidade[campo]
    portal = ConvenioPortalTransparencia.model_validate({"dimConvenio": identidade, "dataPublicacao": "01/10/2026"})
    # Act / Assert
    with pytest.raises(ValidationError):
        confirmar_no_portal(candidato, portal)


def test_snapshot_zip_preserva_texto_com_ponto_e_virgula_e_bom(tmp_path):
    caminho = tmp_path / "fonte.zip"
    with ZipFile(caminho, "w") as arquivo:
        arquivo.writestr("fonte.csv", '\ufeffID_PROPOSTA;ID_ITEM_PAD;DESCRICAO_ITEM\n1;10;"LINAC; aquisição"\n')
    assert list(ler_snapshot_csv(caminho, colunas={"ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"})) == [
        item(descricao="LINAC; aquisição")
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
