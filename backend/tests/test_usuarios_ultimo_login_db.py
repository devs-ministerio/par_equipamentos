"""Último acesso administrativo usa somente login bem-sucedido, com SQL real."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.auth import ACCESS_COOKIE_NAME, create_access_token, create_refresh_token, hash_password
from app.db.base import SessionLocal, engine
from app.db.models import AuditLog, User, UserRole
from app.main import app


@pytest.fixture
def usuarios_login():
    with SessionLocal() as db:
        prefixo = f"ultimo-login-{uuid4().hex}"
        usuarios = [
            User(name=f"{prefixo} {i}", email=f"{prefixo}-{i}@example.com", password_hash="hash-sintetico", role=role)
            for i, role in enumerate((UserRole.admin, UserRole.colaborador, UserRole.leitor, UserRole.gestor))
        ]
        db.add_all(usuarios)
        db.commit()
        yield db, usuarios, prefixo
        db.query(AuditLog).filter(AuditLog.user_id.in_([u.id for u in usuarios])).delete(synchronize_session=False)
        for usuario in usuarios:
            db.delete(usuario)
        db.commit()


def cliente_usuario(db, usuario):
    _, sessao_id = create_refresh_token(db, usuario)
    db.commit()
    cliente = TestClient(app)
    cliente.cookies.set(ACCESS_COOKIE_NAME, create_access_token(usuario, sessao_id))
    return cliente


def test_lista_ultimo_login_ignora_falhas_e_outras_acoes_sem_n_mais_um(usuarios_login):
    # Arrange
    db, usuarios, prefixo = usuarios_login
    inicio = datetime(2026, 10, 20, 12, tzinfo=UTC)
    for usuario, action, entity, instante in (
        (usuarios[1], "login_sucesso", "auth", inicio),
        (usuarios[1], "login_sucesso", "auth", inicio + timedelta(hours=1)),
        (usuarios[1], "login_falha", "auth", inicio + timedelta(hours=2)),
        (usuarios[1], "login_sucesso", "user", inicio + timedelta(hours=3)),
        (usuarios[2], "login_falha", "auth", inicio + timedelta(hours=4)),
    ):
        db.add(
            AuditLog(user_id=usuario.id, entity_name=entity, entity_id=usuario.id, action=action, created_at=instante)
        )
    db.commit()
    cliente = cliente_usuario(db, usuarios[0])
    consultas_auditoria = []

    def registrar(_conn, _cursor, statement, _parameters, _context, _many):
        if "audit_log" in statement.lower():
            consultas_auditoria.append(statement)

    event.listen(engine, "before_cursor_execute", registrar)
    try:
        # Act
        resposta = cliente.get("/usuarios", params={"busca": prefixo})
    finally:
        event.remove(engine, "before_cursor_execute", registrar)
    # Assert
    assert resposta.status_code == 200
    itens = {item["id"]: item for item in resposta.json()["itens"]}
    assert datetime.fromisoformat(itens[usuarios[1].id]["ultimo_login_em"]) == inicio + timedelta(hours=1)
    assert itens[usuarios[2].id]["ultimo_login_em"] is None
    assert itens[usuarios[0].id]["ultimo_login_em"] is None
    assert len(consultas_auditoria) == 1
    assert "details" not in itens[usuarios[1].id]
    pagina = cliente.get("/usuarios", params={"busca": prefixo, "limit": 1, "offset": 1}).json()
    assert pagina["total"] == 4
    assert [item["id"] for item in pagina["itens"]] == [usuarios[1].id]
    consultas_auditoria.clear()
    event.listen(engine, "before_cursor_execute", registrar)
    try:
        vazia = cliente.get("/usuarios", params={"busca": f"{prefixo}-ausente"})
    finally:
        event.remove(engine, "before_cursor_execute", registrar)
    assert vazia.json() == {"itens": [], "total": 0}
    assert consultas_auditoria == []


@pytest.mark.parametrize("indice", [1, 2, 3])
def test_ultimo_login_permanece_restrito_ao_admin(usuarios_login, indice):
    # Arrange
    db, usuarios, _ = usuarios_login
    cliente = cliente_usuario(db, usuarios[indice])
    # Act / Assert
    assert cliente.get("/usuarios").status_code == 403


def test_ultimo_login_nao_e_exposto_em_auth_me(usuarios_login):
    # Arrange
    db, usuarios, _ = usuarios_login
    cliente = cliente_usuario(db, usuarios[0])
    # Act
    resposta = cliente.get("/auth/me")
    # Assert
    assert resposta.status_code == 200
    assert "ultimo_login_em" not in resposta.json()


def test_login_real_e_listagem_mantem_mesma_data_de_auditoria(usuarios_login):
    # Arrange
    db, usuarios, _ = usuarios_login
    usuarios[1].password_hash = hash_password("senha-sintetica-123")
    db.commit()
    cliente = TestClient(app)
    # Act
    login = cliente.post("/auth/login", json={"email": usuarios[1].email, "password": "senha-sintetica-123"})
    admin = cliente_usuario(db, usuarios[0])
    resposta = admin.get("/usuarios", params={"busca": usuarios[1].email})
    # Assert
    assert login.status_code == 200
    assert resposta.status_code == 200
    auditoria = db.query(AuditLog).filter_by(user_id=usuarios[1].id, action="login_sucesso", entity_name="auth").one()
    assert datetime.fromisoformat(resposta.json()["itens"][0]["ultimo_login_em"]) == auditoria.created_at
    assert TestClient(app).get("/usuarios").status_code == 401
