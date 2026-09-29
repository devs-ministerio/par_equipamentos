"""Regras puras de autorização (app.authz) -- sem banco, o próprio motivo de
serem funções puras (usadas tanto pela escrita quanto pelo campo `pode_editar`
exposto na leitura, ver app/routers/monitoramento.py)."""

import pytest

from app.authz import assert_pode_editar_instrumento, usuario_pode_editar_instrumento
from app.db.models import User, UserRole
from app.domain_errors import AuthorizationError

_TITULAR_ID = 10
_OUTRO_ID = 20


def _usuario(role: UserRole, *, id_: int = _OUTRO_ID) -> User:
    return User(id=id_, name="Teste", email=f"teste-{id_}@example.com", role=role)


def test_leitor_nunca_pode_editar_mesmo_sendo_titular():
    leitor = _usuario(UserRole.leitor, id_=_TITULAR_ID)
    assert usuario_pode_editar_instrumento(leitor, {_TITULAR_ID}) is False


def test_admin_pode_editar_instrumento_de_qualquer_um():
    admin = _usuario(UserRole.admin)
    assert usuario_pode_editar_instrumento(admin, {_TITULAR_ID}) is True


def test_gestor_pode_editar_instrumento_de_qualquer_um():
    gestor = _usuario(UserRole.gestor)
    assert usuario_pode_editar_instrumento(gestor, {_TITULAR_ID}) is True


def test_colaborador_sem_titular_designado_pode_editar():
    colaborador = _usuario(UserRole.colaborador)
    assert usuario_pode_editar_instrumento(colaborador, set()) is True


def test_colaborador_que_nao_e_titular_nao_pode_editar():
    colaborador = _usuario(UserRole.colaborador, id_=_OUTRO_ID)
    assert usuario_pode_editar_instrumento(colaborador, {_TITULAR_ID}) is False


def test_colaborador_titular_pode_editar():
    colaborador = _usuario(UserRole.colaborador, id_=_TITULAR_ID)
    assert usuario_pode_editar_instrumento(colaborador, {_TITULAR_ID}) is True


def test_assert_levanta_authorization_error_quando_nao_pode():
    colaborador = _usuario(UserRole.colaborador, id_=_OUTRO_ID)
    with pytest.raises(AuthorizationError) as exc:
        assert_pode_editar_instrumento(colaborador, {_TITULAR_ID})
    assert exc.value.status_code == 403


def test_assert_nao_levanta_quando_pode():
    colaborador = _usuario(UserRole.colaborador, id_=_TITULAR_ID)
    assert_pode_editar_instrumento(colaborador, {_TITULAR_ID})
