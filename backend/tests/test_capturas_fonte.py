"""Histórico, frescor e alerta de fonte indisponível (Plan Mode espelho, etapa 5)."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import FonteCaptura, Notificacao, NotificacaoDestinatario, NotificacaoTipo, User, UserRole
from app.services.capturas_fonte import captura, situacao_das_fontes


def _usuario(db, role: UserRole) -> User:
    usuario = User(
        name=f"Pytest {role.value}",
        email=f"pytest-captura-{role.value}-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=role,
    )
    db.add(usuario)
    db.flush()
    return usuario


def _limpar(db, fonte: str, usuarios: list[User]) -> None:
    ids = [c.id for c in db.query(FonteCaptura).filter_by(fonte=fonte)]
    notificacoes = db.query(Notificacao).filter(
        Notificacao.tipo == NotificacaoTipo.fonte_indisponivel, Notificacao.entidade_id.in_(ids)
    )
    ids_notificacao = [n.id for n in notificacoes]
    db.query(NotificacaoDestinatario).filter(NotificacaoDestinatario.notificacao_id.in_(ids_notificacao)).delete()
    db.query(Notificacao).filter(Notificacao.id.in_(ids_notificacao)).delete()
    db.query(FonteCaptura).filter_by(fonte=fonte).delete()
    for usuario in usuarios:
        db.query(User).filter_by(id=usuario.id).delete()
    db.commit()


def test_captura_ok_registra_contadores_sem_alerta():
    fonte = f"teste_{uuid4().hex}"
    db = SessionLocal()
    try:
        with captura(fonte) as c:
            c.itens_verificados = 10
            c.itens_alterados = 2
            c.avisos_criados = 1
            c.detalhes["ausentes"] = 0
        registro = db.query(FonteCaptura).filter_by(fonte=fonte).one()
        assert (registro.status, registro.itens_verificados, registro.itens_alterados) == ("ok", 10, 2)
        assert registro.detalhes == {"ausentes": 0}
        assert (
            db.query(Notificacao).filter_by(tipo=NotificacaoTipo.fonte_indisponivel, entidade_id=registro.id).count()
            == 0
        )
    finally:
        _limpar(db, fonte, [])
        db.close()


def test_falha_da_fonte_persiste_erro_repropaga_e_avisa_so_gestor_admin_sem_duplicar():
    fonte = f"teste_{uuid4().hex}"
    db = SessionLocal()
    usuarios = [_usuario(db, r) for r in (UserRole.gestor, UserRole.admin, UserRole.colaborador, UserRole.leitor)]
    db.commit()
    gestor, admin, colaborador, leitor = usuarios
    try:
        for _ in range(2):
            with pytest.raises(RuntimeError, match="dump fora do ar"):
                with captura(fonte):
                    raise RuntimeError("dump fora do ar")
        capturas = db.query(FonteCaptura).filter_by(fonte=fonte).order_by(FonteCaptura.id).all()
        assert [c.status for c in capturas] == ["erro", "erro"]
        assert "dump fora do ar" in (capturas[0].erro or "")

        alertas = (
            db.query(Notificacao)
            .filter(
                Notificacao.tipo == NotificacaoTipo.fonte_indisponivel,
                Notificacao.entidade_id.in_([c.id for c in capturas]),
            )
            .all()
        )
        assert len(alertas) == 1  # segunda falha no mesmo dia não gera nova enxurrada
        assert "mantidos" in (alertas[0].corpo or "")
        destinatarios = {
            d.usuario_id for d in db.query(NotificacaoDestinatario).filter_by(notificacao_id=alertas[0].id)
        }
        assert {gestor.id, admin.id} <= destinatarios
        assert colaborador.id not in destinatarios and leitor.id not in destinatarios
    finally:
        _limpar(db, fonte, usuarios)
        db.close()


def test_resposta_parcial_vira_status_parcial_e_alerta():
    fonte = f"teste_{uuid4().hex}"
    db = SessionLocal()
    try:
        with captura(fonte) as c:
            c.itens_verificados = 5
            c.parcial = "3 de 5 convênios ausentes do dump"
        registro = db.query(FonteCaptura).filter_by(fonte=fonte).one()
        assert registro.status == "parcial"
        assert (
            db.query(Notificacao).filter_by(tipo=NotificacaoTipo.fonte_indisponivel, entidade_id=registro.id).count()
            == 1
        )
    finally:
        _limpar(db, fonte, [])
        db.close()


def test_situacao_marca_defasada_e_preserva_ultimo_sucesso():
    fonte = f"teste_{uuid4().hex}"
    db = SessionLocal()
    try:
        antigo = datetime.now(UTC) - timedelta(hours=72)
        db.add(FonteCaptura(fonte=fonte, iniciado_em=antigo, finalizado_em=antigo, status="ok"))
        db.commit()
        with pytest.raises(ValueError):
            with captura(fonte):
                raise ValueError("falhou")
        situacao = next(s for s in situacao_das_fontes(db) if s.fonte == fonte)
        assert situacao.ultima_tentativa.status == "erro"
        assert situacao.ultimo_sucesso_em is not None  # o último dado confirmado não some
        assert situacao.defasada is True
    finally:
        _limpar(db, fonte, [])
        db.close()


def test_endpoint_exige_sessao_e_lista_fontes(headers_autenticados):
    from fastapi.testclient import TestClient

    from app.main import app

    fonte = f"teste_{uuid4().hex}"
    db = SessionLocal()
    try:
        agora = datetime.now(UTC)
        db.add(FonteCaptura(fonte=fonte, iniciado_em=agora, finalizado_em=agora, status="ok", itens_verificados=3))
        db.commit()
        cliente = TestClient(app)
        assert cliente.get("/fontes/capturas").status_code == 401
        resposta = cliente.get("/fontes/capturas", headers=headers_autenticados)
        assert resposta.status_code == 200
        linha = next(f for f in resposta.json() if f["fonte"] == fonte)
        assert linha["status"] == "ok" and linha["defasada"] is False and linha["itens_verificados"] == 3
    finally:
        _limpar(db, fonte, [])
        db.close()
