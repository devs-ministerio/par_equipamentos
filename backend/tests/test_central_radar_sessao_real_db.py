"""Fluxo HTTP com login/cookies reais e role SQL restrito; não é E2E de browser."""

from contextlib import contextmanager
from itertools import count

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth import hash_password
from app.db.base import get_db
from app.db.models import Notificacao, User, UserStatus
from app.main import app
from app.services.aprovacao_legado import aprovar_entrada
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_radar_append_only_recuperado_db import historico_protegido as historico_protegido
from tests.test_radar_runtime_restrito_db import runtime as runtime
from tests.test_revisao_legado_recuperada_db import preparar_prova

_CLIENTES = count(100)
_SENHA_SINTETICA = "Senha-Sintetica-2026!"


@pytest.fixture
def fluxo(runtime, dados, monkeypatch):
    db, usuarios, _ = runtime
    senha_hash = hash_password(_SENHA_SINTETICA)
    for perfil in ("admin", "gestor", "titular", "leitor"):
        db.get(User, usuarios[perfil]).password_hash = senha_hash
    db.commit()
    ref, _, _, _, pedido = preparar_prova(db, dados, notificar_novos=True)
    aprovar_entrada(db=db, usuario_id=usuarios["admin"], candidato_id=ref.candidato_id, dados=pedido)
    avisos = dict(db.execute(select(Notificacao.tipo, Notificacao.id)).tuples().all())
    emails = {perfil: db.get(User, usuarios[perfil]).email for perfil in ("admin", "gestor", "titular", "leitor")}
    db.commit()

    def banco_isolado():
        yield db

    # Substitui somente o destino SQL. Autenticação, sessão, CSRF e Services
    # não são mockados. Conexão runtime dedicada continua restrita.
    monkeypatch.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: banco_isolado})

    @contextmanager
    def cliente(perfil=None):
        with TestClient(app, base_url="https://testserver", client=(f"192.0.2.{next(_CLIENTES)}", 40000)) as http:
            if perfil is not None:
                resposta = http.post("/auth/login", json={"email": emails[perfil], "password": _SENHA_SINTETICA})
                assert resposta.status_code == 200
                assert "access_token" not in resposta.json()
                assert http.cookies.get("sigeo_access") and http.cookies.get("sigeo_refresh")
            yield http

    return db, usuarios, {tipo.value: ident for tipo, ident in avisos.items()}, cliente


def csrf(http):
    return {"X-CSRF-Token": http.cookies.get("sigeo_csrf")}


@pytest.mark.parametrize("perfil", ["admin", "gestor"])
def test_login_real_leitura_arquivo_restauracao_e_badge_por_destinatario(fluxo, perfil):
    _, _, avisos, cliente = fluxo
    outro = "gestor" if perfil == "admin" else "admin"
    with cliente(perfil) as http, cliente(outro) as outra_sessao:
        pagina = http.get("/notificacoes").json()
        assert pagina["total"] == pagina["nao_lidas"] == 2
        assert {a["tipo"] for a in pagina["itens"]} == {"convenio_descoberto", "aprovacao_carteira"}
        destinos = {a["tipo"]: a["destino"] for a in pagina["itens"]}
        assert destinos == {
            "convenio_descoberto": None,
            "aprovacao_carteira": "/monitoramento-equipamentos?busca=999001",
        }
        leitura = http.patch(f"/notificacoes/{avisos['convenio_descoberto']}", headers=csrf(http))
        assert leitura.status_code == 200 and leitura.json()["lida"] is True
        assert http.get("/notificacoes").json()["nao_lidas"] == 1
        caminho = f"/notificacoes/{avisos['aprovacao_carteira']}/arquivo"
        assert http.patch(caminho, json={"arquivada": True}, headers=csrf(http)).status_code == 200
        assert http.get("/notificacoes").json()["nao_lidas"] == 0
        arquivadas = http.get("/notificacoes?arquivadas=true").json()
        assert arquivadas["total"] == 1 and arquivadas["itens"][0]["lida"] is False
        assert http.patch(caminho, json={"arquivada": False}, headers=csrf(http)).status_code == 200
        assert http.get("/notificacoes").json()["nao_lidas"] == 1
        assert outra_sessao.get("/notificacoes").json()["nao_lidas"] == 2
        assert http.patch("/notificacoes/lidas", headers=csrf(http)).json() == {"alteradas": 1}
        assert http.patch("/notificacoes/lidas", headers=csrf(http)).json() == {"alteradas": 0}


@pytest.mark.parametrize("perfil", ["titular", "leitor"])
def test_login_valido_nao_autoriza_aviso_de_outro_destinatario(fluxo, perfil):
    _, _, avisos, cliente = fluxo
    with cliente(perfil) as http:
        assert http.get("/notificacoes").json()["total"] == 0
        for ident in avisos.values():
            assert http.patch(f"/notificacoes/{ident}", headers=csrf(http)).status_code == 404
            assert (
                http.patch(f"/notificacoes/{ident}/arquivo", json={"arquivada": True}, headers=csrf(http)).status_code
                == 404
            )


def test_csrf_ausente_ou_divergente_nao_muta_aviso(fluxo):
    _, _, avisos, cliente = fluxo
    with cliente("admin") as http:
        caminho = f"/notificacoes/{avisos['convenio_descoberto']}"
        assert http.patch(caminho).status_code == 403
        assert http.patch(caminho, headers={"X-CSRF-Token": "divergente"}).status_code == 403
        assert http.get("/notificacoes").json()["nao_lidas"] == 2


def test_sem_cookie_ou_token_invalido_nao_le_notificacoes(fluxo):
    _, _, _, cliente = fluxo
    with cliente() as http:
        assert http.get("/notificacoes").status_code == 401
        assert http.get("/notificacoes", headers={"Cookie": "sigeo_access=invalido"}).status_code == 401


def test_logout_revoga_sessao_e_token_anterior_nao_reabre_central(fluxo):
    _, _, _, cliente = fluxo
    with cliente("admin") as http:
        anterior = http.cookies.get("sigeo_access")
        assert http.post("/auth/logout", headers=csrf(http)).status_code == 200
        assert http.get("/notificacoes").status_code == 401
        assert http.get("/notificacoes", headers={"Cookie": f"sigeo_access={anterior}"}).status_code == 401


def test_conta_inativada_perde_acesso_com_cookie_ainda_presente(fluxo):
    db, usuarios, _, cliente = fluxo
    with cliente("admin") as http:
        db.get(User, usuarios["admin"]).status = UserStatus.inactive
        db.commit()
        assert http.get("/notificacoes").status_code == 403
