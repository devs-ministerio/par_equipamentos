"""Isolamento transacional após cópia sintética, com sessão HTTP real."""

from dataclasses import asdict
from hashlib import sha256

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from alembic import command
from app.auth import create_access_token, create_refresh_token, hash_password, verify_password
from app.db.base import get_db
from app.db.models import User
from app.main import app
from scripts.neutralizar_acesso_sintetico import neutralizar_acesso_sintetico
from scripts.transferencia_sintetica_recuperacao import integridade_tabelas, transferir_sintetico
from tests.test_cadeia_migrations_recuperacao_db import banco_descartavel
from tests.test_transferencia_sintetica_recuperacao_db import bancos_transferencia as bancos_transferencia

SENHA = "Senha-Sintetica-2026!"
CONVITE = "convite-exclusivamente-sintetico"


@pytest.fixture
def acesso_copiado(bancos_transferencia):
    origem, destino, bootstrap, _, _ = bancos_transferencia
    transferir_sintetico(origem=origem, destino=destino, bootstrap=bootstrap)
    # Apenas o destino descartável recebe credenciais conhecidas de teste.
    usuario = destino.scalar(text('SELECT min(id) FROM public."user"'))
    destino.execute(
        text("""UPDATE public."user" SET password_hash=:senha,status='active',
        activation_token_hash=:convite,activation_expires_at=now()+interval '1 day',
        locked_until=NULL,failed_login_attempts=0 WHERE id=:id"""),
        {"id": usuario, "senha": hash_password(SENHA), "convite": sha256(CONVITE.encode()).hexdigest()},
    )
    destino.execute(
        text("""INSERT INTO refresh_token (user_id,token_hash,expires_at,revoked_at)
        SELECT :id,'hash-sintetico-' || n::text,now()+interval '1 day',
        CASE WHEN n=1 THEN now()-interval '1 hour' ELSE NULL END FROM generate_series(1,501) n"""),
        {"id": usuario},
    )
    destino.commit()
    with Session(destino.engine) as db:
        user = db.get(User, usuario)
        assert user is not None
        refresh, sid = create_refresh_token(db, user)
        access = create_access_token(user, sid)
        email = user.email
        db.commit()
    esperado = integridade_tabelas(destino)
    destino.commit()
    yield origem, destino, esperado, usuario, refresh, access, email


def test_neutraliza_em_lotes_preservando_identidades_vinculos_provas_e_auditoria(acesso_copiado):
    origem, destino, esperado, _, _, _, _ = acesso_copiado
    fonte_antes = integridade_tabelas(origem)
    antes = dict(destino.execute(text("SELECT id,revoked_at FROM refresh_token")).all())
    destino.commit()
    resultado = neutralizar_acesso_sintetico(destino=destino, esperado=esperado)
    assert asdict(resultado) == {"usuarios_inativados": esperado["user"].linhas, "sessoes_neutralizadas": 502}
    depois = integridade_tabelas(destino)
    assert set(t for t in esperado if esperado[t] != depois[t]) == {"user", "refresh_token"}
    assert {t: d.linhas for t, d in depois.items()} == {t: d.linhas for t, d in esperado.items()}
    assert integridade_tabelas(origem) == fonte_antes
    assert (
        destino.scalar(
            text(
                "SELECT count(*) FROM public.\"user\" WHERE status <> 'inactive' OR activation_token_hash IS NOT NULL OR activation_expires_at IS NOT NULL"
            )
        )
        == 0
    )
    assert (
        destino.scalar(
            text("SELECT count(*) FROM refresh_token WHERE revoked_at IS NULL OR token_hash LIKE 'hash-sintetico-%'")
        )
        == 0
    )
    assert (
        destino.scalar(text("SELECT revoked_at FROM refresh_token WHERE id=:id"), {"id": min(antes)})
        == antes[min(antes)]
    )
    for senha in destino.scalars(text('SELECT password_hash FROM public."user"')):
        assert senha.startswith("$argon2id$") and not verify_password(SENHA, senha)
    destino.commit()
    with pytest.raises(ValueError, match="manifesto"):
        neutralizar_acesso_sintetico(destino=destino, esperado=esperado)


def test_cookies_senha_e_convite_anteriores_nao_reabrem_acesso(acesso_copiado, monkeypatch):
    _, destino, esperado, usuario, refresh, access, email = acesso_copiado

    def banco():
        with Session(destino.engine) as db:
            yield db

    monkeypatch.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: banco})
    # JWT usa a mesma chave efêmera antes/depois: revogação deve bastar mesmo
    # sem depender da futura troca de chave do ambiente local.
    with TestClient(app, base_url="https://testserver", client=("192.0.2.230", 40000)) as http:
        headers = {
            "Cookie": f"sigeo_access={access}; sigeo_refresh={refresh}; sigeo_csrf=csrf-sintetico",
            "X-CSRF-Token": "csrf-sintetico",
        }
        assert http.get("/auth/me", headers=headers).status_code == 200
        neutralizar_acesso_sintetico(destino=destino, esperado=esperado)
        assert http.get("/auth/me", headers=headers).status_code == 401
        assert http.post("/auth/refresh", headers=headers).status_code == 401
        assert http.post("/auth/login", json={"email": email, "password": SENHA}).status_code == 401
        assert http.post("/auth/ativar", json={"token": CONVITE, "password": SENHA}).status_code == 400
        assert http.post("/auth/redefinir-senha", json={"token": CONVITE, "password": SENHA}).status_code == 400
        # Reativar uma conta isoladamente não ressuscita sessão/senha copiada.
        destino.execute(text("UPDATE public.\"user\" SET status='active' WHERE id=:id"), {"id": usuario})
        destino.commit()
        assert http.get("/auth/me", headers=headers).status_code == 401
        assert http.post("/auth/login", json={"email": email, "password": SENHA}).status_code == 401


@pytest.mark.parametrize("falha", ["sql", "coluna_nao_autorizada", "senha_nao_substituida", "token_nao_substituido"])
def test_falha_reverte_senhas_convites_sessoes_e_status(acesso_copiado, falha):
    _, destino, esperado, _, _, _, _ = acesso_copiado
    if falha == "sql":
        destino.execute(
            text("""CREATE FUNCTION falhar_neutralizacao() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'erro-sintetico-sigiloso'; END $$""")
        )
        destino.execute(
            text("""CREATE TRIGGER falhar_neutralizacao BEFORE UPDATE ON public.refresh_token
            FOR EACH ROW EXECUTE FUNCTION falhar_neutralizacao()""")
        )
    elif falha == "coluna_nao_autorizada":
        destino.execute(
            text("""CREATE FUNCTION falhar_neutralizacao() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN NEW.name := 'mudança-não-autorizada'; RETURN NEW; END $$""")
        )
        destino.execute(
            text("""CREATE TRIGGER falhar_neutralizacao BEFORE UPDATE ON public."user"
            FOR EACH ROW EXECUTE FUNCTION falhar_neutralizacao()""")
        )
    else:
        tabela = 'public."user"' if falha == "senha_nao_substituida" else "public.refresh_token"
        coluna = "password_hash" if falha == "senha_nao_substituida" else "token_hash"
        destino.execute(
            text(f"""CREATE FUNCTION falhar_neutralizacao() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN NEW.{coluna} := OLD.{coluna}; RETURN NEW; END $$""")
        )
        destino.execute(
            text(f"""CREATE TRIGGER falhar_neutralizacao BEFORE UPDATE ON {tabela}
            FOR EACH ROW EXECUTE FUNCTION falhar_neutralizacao()""")
        )
    destino.commit()
    with pytest.raises(ValueError, match="revertid") as erro:
        neutralizar_acesso_sintetico(destino=destino, esperado=esperado)
    assert "erro-sintetico-sigiloso" not in str(erro.value)
    assert integridade_tabelas(destino) == esperado


def test_destino_modificado_desde_manifesto_nao_e_neutralizado(acesso_copiado):
    _, destino, esperado, _, _, _, _ = acesso_copiado
    destino.execute(text("UPDATE convenio SET objeto='Alteração sintética após o manifesto'"))
    alterado = integridade_tabelas(destino)
    destino.commit()
    with pytest.raises(ValueError, match="manifesto"):
        neutralizar_acesso_sintetico(destino=destino, esperado=esperado)
    assert integridade_tabelas(destino) == alterado


def test_recusa_transacao_preexistente(acesso_copiado):
    _, destino, esperado, _, _, _, _ = acesso_copiado
    destino.execute(text("SELECT 1"))
    with pytest.raises(ValueError, match="transação própria"):
        neutralizar_acesso_sintetico(destino=destino, esperado=esperado)
    assert integridade_tabelas(destino) == esperado


def test_revisao_nao_validada_nao_muda_dados():
    with banco_descartavel() as (conn, config):
        command.upgrade(config, "a6e24b7f5d39")
        antes = integridade_tabelas(conn)
        conn.commit()
        with pytest.raises(ValueError, match="revisão"):
            neutralizar_acesso_sintetico(destino=conn, esperado=antes)
        assert integridade_tabelas(conn) == antes
