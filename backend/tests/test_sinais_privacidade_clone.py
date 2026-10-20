"""Sinais conservadores; não transforma identificadores ou valores oficiais."""

import pytest
from pydantic import JsonValue

from scripts.inventario_textos_clone import CampoExaminado, validar_achados_cobertos
from scripts.sinais_privacidade_clone import sinais_payload, sinais_texto


@pytest.mark.parametrize(
    "valor,sinal",
    [
        ("contato@privado.invalid", "email"),
        ("123.456.789-00", "cpf_formatado"),
        ("(61) 99999-0000", "telefone_formatado"),
        ("https://local.invalid/?token=segredo-sintetico", "segredo_em_url"),
    ],
)
def test_detecta_somente_o_tipo_sem_retornar_o_conteudo(valor, sinal):
    assert sinais_texto(valor) == {sinal}


@pytest.mark.parametrize(
    "valor",
    [
        "usuario-local-28@example.com",
        "contato-local@example.com",
        "https://local.invalid/?token=[protegido]",
        "971252 / 25000198305202459 / 12345678901 / R$ 1.234,56",
        "Texto interno protegido no clone local",
    ],
)
def test_marcadores_e_identidades_oficiais_nao_sao_reescritos(valor):
    assert sinais_texto(valor) == set()


def test_json_aninhado_detecta_chave_pessoal_sem_confundir_responsavel_id():
    payload: dict[str, JsonValue] = {
        "id_proposta": "12345678901",
        "responsavel_id": 12,
        "itens": [{"CPF": "12345678900"}],
    }
    assert sinais_payload(payload) == {"campo_pessoal_sem_marcador"}
    assert payload == {"id_proposta": "12345678901", "responsavel_id": 12, "itens": [{"CPF": "12345678900"}]}
    assert (
        sinais_payload({"cpf": "[dado pessoal protegido]", "email": "contato-local@example.com", "ip": None}) == set()
    )


def test_marcador_nao_oculta_outro_valor_no_mesmo_json():
    assert sinais_payload({"protegido_no_clone_local": True, "email": "contato@privado.invalid"}) == {
        "email",
        "campo_pessoal_sem_marcador",
    }


def test_email_local_e_pseudonimo_em_payload_nao_geram_falso_sinal():
    assert sinais_payload({"email": "usuario-local-28@example.com", "responsavel": "Pessoa local abcdef0123"}) == set()


def test_gate_delimitado_exige_inventario_e_bloqueia_prova_com_sinal():
    with pytest.raises(ValueError, match="vazio"):
        validar_achados_cobertos(())
    with pytest.raises(ValueError, match="adoção bloqueada"):
        validar_achados_cobertos(
            (CampoExaminado("candidato_legado_recaptura", "payload_oficial", 1, 1, (("email", 1),)),)
        )


def test_gate_aceita_achado_apenas_em_campo_com_projecao_privada():
    validar_achados_cobertos(
        (
            CampoExaminado("user", "email", 28, 6, (("email", 6),)),
            CampoExaminado("audit_log", "details", 1555, 38, (("campo_pessoal_sem_marcador", 38),)),
        )
    )
