"""Caixa individual: filtro, arquivo reversível, leitura em lote e IDOR."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_refresh_token, hash_password
from app.db.base import SessionLocal
from app.db.models import Notificacao, NotificacaoDestinatario, NotificacaoTipo, User, UserRole
from app.domain_errors import NotFoundError
from app.main import app
from app.services.notificacoes import arquivar_notificacao, listar_notificacoes, marcar_todas_lidas


@pytest.fixture
def caixa():
    db = SessionLocal()
    usuarios = [
        User(
            name="Pessoa sintética",
            email=f"pytest-central-{uuid4()}@example.com",
            password_hash=hash_password("senha-sintetica"),
            role=UserRole.colaborador,
        )
        for _ in range(2)
    ]
    db.add_all(usuarios)
    db.flush()
    avisos = [
        Notificacao(
            tipo=NotificacaoTipo.proposta_candidata,
            titulo="Proposta 100% equipamento",
            corpo="Valor alterado",
            entidade_id=0,
        ),
        Notificacao(
            tipo=NotificacaoTipo.fonte_indisponivel, titulo="SICONV indisponível", corpo="Preservado", entidade_id=0
        ),
    ]
    db.add_all(avisos)
    db.flush()
    for usuario in usuarios:
        for aviso in avisos:
            db.add(NotificacaoDestinatario(usuario_id=usuario.id, notificacao_id=aviso.id))
    db.commit()
    yield db, usuarios, avisos
    db.rollback()
    db.query(Notificacao).filter(Notificacao.id.in_([a.id for a in avisos])).delete()
    db.query(User).filter(User.id.in_([u.id for u in usuarios])).delete()
    db.commit()
    db.close()


def listar(db, usuario, **filtros):
    return listar_notificacoes(db=db, usuario_id=usuario.id, limit=10, offset=0, apenas_nao_lidas=False, **filtros)


def test_busca_literal_tipo_e_total_filtrado_sem_alterar_badge(caixa):
    db, usuarios, _ = caixa
    resultado = listar(db, usuarios[0], busca="100%", tipo=NotificacaoTipo.proposta_candidata)
    assert resultado.total == 1
    assert resultado.nao_lidas == 2
    assert resultado.itens[0].notificacao.titulo == "Proposta 100% equipamento"
    assert listar(db, usuarios[0], busca="%qualquer").total == 0


def test_arquivo_e_restauracao_so_afetam_destinatario_atual(caixa):
    db, usuarios, avisos = caixa
    resultado = arquivar_notificacao(db=db, usuario_id=usuarios[0].id, notificacao_id=avisos[0].id, arquivada=True)
    assert resultado.arquivada is True
    assert listar(db, usuarios[0]).total == 1
    assert listar(db, usuarios[0]).nao_lidas == 1
    assert listar(db, usuarios[1]).total == 2
    assert listar(db, usuarios[1]).nao_lidas == 2
    assert listar(db, usuarios[0], arquivadas=True).itens[0].arquivada is True
    arquivar_notificacao(db=db, usuario_id=usuarios[0].id, notificacao_id=avisos[0].id, arquivada=False)
    assert listar(db, usuarios[0]).total == 2
    assert listar(db, usuarios[0]).nao_lidas == 2


def test_ler_todas_idempotente_exclui_arquivo_e_preserva_outro_usuario(caixa):
    db, usuarios, avisos = caixa
    arquivar_notificacao(db=db, usuario_id=usuarios[0].id, notificacao_id=avisos[0].id, arquivada=True)
    assert marcar_todas_lidas(db=db, usuario_id=usuarios[0].id) == 1
    assert marcar_todas_lidas(db=db, usuario_id=usuarios[0].id) == 0
    assert listar(db, usuarios[0]).nao_lidas == 0
    assert listar(db, usuarios[1]).nao_lidas == 2
    assert listar(db, usuarios[0], arquivadas=True).itens[0].lida is False


def test_nao_destinatario_nao_pode_arquivar(caixa):
    db, _, avisos = caixa
    with pytest.raises(NotFoundError):
        arquivar_notificacao(db=db, usuario_id=0, notificacao_id=avisos[0].id, arquivada=True)


def test_http_autenticacao_csrf_validacao_e_idor(caixa):
    db, usuarios, avisos = caixa
    _, refresh_id = create_refresh_token(db, usuarios[0])
    db.commit()
    token = create_access_token(usuarios[0], refresh_id)
    cabecalhos = {"Cookie": f"sigeo_access={token}; sigeo_csrf=teste", "X-CSRF-Token": "teste"}
    with TestClient(app) as client:
        assert client.get("/notificacoes").status_code == 401
        assert client.get("/notificacoes?offset=-1", headers=cabecalhos).status_code == 422
        assert client.get("/notificacoes?tipo=invalido", headers=cabecalhos).status_code == 422
        assert (
            client.patch(
                f"/notificacoes/{avisos[0].id}/arquivo",
                json={"arquivada": True},
                headers={"Cookie": cabecalhos["Cookie"]},
            ).status_code
            == 403
        )
        assert (
            client.patch("/notificacoes/999999999/arquivo", json={"arquivada": True}, headers=cabecalhos).status_code
            == 404
        )
        assert (
            client.patch(
                f"/notificacoes/{avisos[0].id}/arquivo",
                json={"arquivada": True, "usuario_id": usuarios[1].id},
                headers=cabecalhos,
            ).status_code
            == 422
        )
        resposta = client.patch(f"/notificacoes/{avisos[0].id}/arquivo", json={"arquivada": True}, headers=cabecalhos)
        assert resposta.status_code == 200 and resposta.json()["arquivada"] is True
        assert client.patch("/notificacoes/lidas", headers=cabecalhos).json() == {"alteradas": 1}
        assert client.get("/notificacoes?arquivadas=true", headers=cabecalhos).json()["total"] == 1
