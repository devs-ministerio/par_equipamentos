import pytest
from pydantic import JsonValue

from scripts.captura_local_guardas import validar_staging
from scripts.proteger_clone_local import ProtecaoTexto
from scripts.recapturar_propostas_local import DetalheLocal, executar


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://local@fonte.invalid/sigeo_homologacao_base_20261006_api_1234abcd",
        "postgresql://local@127.0.0.1/sigeo_homologacao_clone_20261006",
        "postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006",
        "postgresql://local@127.0.0.1/sigeo_test_clone_20261006",
        "postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006_api_1234abcd?host=fonte.invalid",
    ],
)
def test_recaptura_recusa_bancos_fora_do_staging(url):
    with pytest.raises(ValueError):
        validar_staging(url)


def test_recaptura_aceita_apenas_staging_exclusivo():
    assert (
        validar_staging("postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006_api_1234abcd")
        == "sigeo_homologacao_base_20261006_api_1234abcd"
    )


@pytest.mark.parametrize("limite", [0, 6, -1])
def test_recaptura_limite_invalido_falha_antes_de_importar_db(limite):
    with pytest.raises(ValueError):
        executar(limite=limite)


def test_recaptura_recusa_urls_divergentes_antes_de_importar_db(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006_api_1234abcd")
    monkeypatch.setenv("DATABASE_URL_MIGRATION", "postgresql://local@127.0.0.1/sigeo_homologacao_clone_20261006")
    with pytest.raises(ValueError):
        executar(limite=1)


def test_payload_e_protegido_antes_de_diff_preservando_identidade_e_valores():
    # Arrange: dados sintéticos que não podem chegar crus às notificações.
    detalhe: dict[str, JsonValue] = {
        "proposta": {
            "id_proposta": 42,
            "cnpj_ente_recebedor": "00000000000000",
            "nm_ente_recebedor": "Instituição sintética",
            "vl_total_planejamento_gastos": 123.45,
            "email": "pessoa@invalid.test",
            "cpf": "12345678901",
        },
        "programa": {"id_programa": 9},
        "metas": [],
        "cronograma_desembolso": [],
        "analise": [],
        "distribuicao_recurso": [],
    }
    # Act: proteção de fronteira, seguida de contrato estrito de árvore.
    protegido = DetalheLocal.model_validate(ProtecaoTexto([]).payload(detalhe))
    # Assert: domínio público preservado; dado pessoal eliminado.
    assert protegido.proposta["id_proposta"] == 42
    assert protegido.proposta["vl_total_planejamento_gastos"] == 123.45
    assert protegido.proposta["email"] == "[dado pessoal protegido]"
    assert protegido.proposta["cpf"] == "[dado pessoal protegido]"
    assert protegido.metas == []
