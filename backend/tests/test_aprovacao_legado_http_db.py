"""Contrato HTTP real: cookies/CSRF/Service/SQL restrito, sem mock do domínio."""

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from itertools import count
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.auth import hash_password
from app.db.base import get_db
from app.db.models import (
    Convenio,
    FonteCaptura,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoDestinatario,
    User,
    UserRole,
    UserStatus,
)
from app.db.models_legado import CandidatoLegadoDecisao, CandidatoLegadoRecaptura
from app.main import app
from app.services.recapturas_legado import registrar_recaptura
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_radar_append_only_recuperado_db import historico_protegido as historico_protegido
from tests.test_radar_runtime_restrito_db import runtime as runtime
from tests.test_revisao_legado_recuperada_db import preparar_prova

_CLIENTES = count(1)
_SENHA_SINTETICA = "Senha-Sintetica-Contrato-2026!"


@pytest.fixture
def fluxo_aprovacao(runtime, dados, monkeypatch):
    db, usuarios, _ = runtime
    hash_senha = hash_password(_SENHA_SINTETICA)
    for perfil in ("admin", "gestor", "titular", "leitor"):
        db.get(User, usuarios[perfil]).password_hash = hash_senha
    db.commit()
    ref, _, _, prova, pedido = preparar_prova(db, dados)
    emails = {perfil: db.get(User, usuarios[perfil]).email for perfil in ("admin", "gestor", "titular", "leitor")}
    db.commit()

    def banco_isolado():
        yield db

    monkeypatch.setattr(app, "dependency_overrides", {**app.dependency_overrides, get_db: banco_isolado})

    @contextmanager
    def cliente(perfil=None):
        with TestClient(app, base_url="https://testserver", client=(f"198.51.100.{next(_CLIENTES)}", 40000)) as http:
            if perfil:
                login = http.post("/auth/login", json={"email": emails[perfil], "password": _SENHA_SINTETICA})
                assert login.status_code == 200
            yield http

    return db, usuarios, ref, prova, pedido, cliente


def postar(http, candidato_id, pedido, *, csrf=True):
    token = http.cookies.get("sigeo_csrf")
    headers = {"X-CSRF-Token": token} if csrf and token else {}
    return http.post(f"/candidatos-legados/{candidato_id}/aprovacoes", json=pedido, headers=headers)


def sem_inclusao(db):
    assert db.scalar(select(func.count()).select_from(Convenio)) == 1
    assert db.scalar(select(func.count()).select_from(InstrumentoEquipamento)) == 1
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 0
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 0


@pytest.mark.parametrize("perfil", ["admin", "gestor"])
def test_aprova_e_replay_retornam_mesmos_vinculos_sem_monitoramento_automatico(fluxo_aprovacao, perfil):
    db, usuarios, ref, prova, pedido, cliente = fluxo_aprovacao
    with cliente(perfil) as http:
        resposta = postar(http, ref.candidato_id, pedido.model_dump(mode="json"))
        assert resposta.status_code == 200
        decisao = resposta.json()
        assert decisao["situacao"] == "aprovado" and decisao["usuario_id"] == usuarios[perfil]
        assert decisao["recaptura_id"] == prova.id and decisao["captura_id"] == ref.captura_id
        salvo = db.get(CandidatoLegadoDecisao, decisao["id"])
        assert decisao["convenio_id"] == salvo.convenio_id
        assert db.get(Convenio, decisao["convenio_id"]).numero == "999001"
        replay = postar(http, ref.candidato_id, pedido.model_dump(mode="json"))
        assert replay.status_code == 200 and replay.json() == decisao
        assert not {"payload_oficial", "siconv_raw", "password_hash", "token_hash"} & decisao.keys()
    assert db.scalar(select(func.count()).select_from(Convenio)) == 2
    assert db.scalar(select(func.count()).select_from(InstrumentoEquipamento)) == 1
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 1
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 1
    assert set(db.scalars(select(NotificacaoDestinatario.usuario_id))) == {usuarios["admin"], usuarios["gestor"]}


@pytest.mark.parametrize("perfil", [None, "titular", "leitor"])
def test_sem_sessao_ou_perfil_nao_autorizado_nao_aprova(fluxo_aprovacao, perfil):
    db, _, ref, _, pedido, cliente = fluxo_aprovacao
    with cliente(perfil) as http:
        if perfil is None:
            # Satisfazer double-submit não autentica: sem JWT/refresh, 401.
            http.cookies.set("sigeo_csrf", "csrf-sintetico-sem-sessao")
        resposta = postar(http, ref.candidato_id, pedido.model_dump(mode="json"))
        assert resposta.status_code == (401 if perfil is None else 403)
    sem_inclusao(db)


def test_csrf_ausente_nao_aprova_mesmo_com_sessao_admin(fluxo_aprovacao):
    db, _, ref, _, pedido, cliente = fluxo_aprovacao
    with cliente("admin") as http:
        assert postar(http, ref.candidato_id, pedido.model_dump(mode="json"), csrf=False).status_code == 403
    sem_inclusao(db)


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("captura_id", True),
        ("recaptura_id", "1"),
        ("versao", -1),
        ("hash_revisado", "invalido"),
        ("justificativa", " "),
        ("chave", "invalida"),
        ("payload_oficial", {"segredo": "nao-ecoar-entrada"}),
    ],
)
def test_payload_invalido_ou_upload_de_prova_recusado_sem_eco(fluxo_aprovacao, campo, valor):
    db, _, ref, _, pedido, cliente = fluxo_aprovacao
    corpo = pedido.model_dump(mode="json")
    corpo[campo] = valor
    with cliente("admin") as http:
        resposta = postar(http, ref.candidato_id, corpo)
        assert resposta.status_code == 422
        assert "nao-ecoar-entrada" not in resposta.text
    sem_inclusao(db)


@pytest.mark.parametrize(
    "campo,valor", [("versao", 99999), ("captura_id", 99999), ("recaptura_id", 99999), ("hash_revisado", "0" * 64)]
)
def test_revisao_obsoleta_ou_prova_alheia_retornam_conflito(fluxo_aprovacao, campo, valor):
    db, _, ref, _, pedido, cliente = fluxo_aprovacao
    corpo = pedido.model_dump(mode="json")
    corpo[campo] = valor
    with cliente("admin") as http:
        assert postar(http, ref.candidato_id, corpo).status_code == 409
    sem_inclusao(db)


@pytest.mark.parametrize("defeito", ["expirada", "futura", "parcial"])
def test_rodada_nao_confiavel_bloqueia_aprovacao_http(fluxo_aprovacao, defeito):
    db, _, ref, prova, pedido, cliente = fluxo_aprovacao
    rodada = db.get(FonteCaptura, prova.fonte_captura_id)
    if defeito == "parcial":
        rodada.status = "parcial"
    else:
        rodada.iniciado_em = datetime.now(UTC) + (timedelta(hours=1) if defeito == "futura" else -timedelta(hours=25))
    db.commit()
    with cliente("admin") as http:
        assert postar(http, ref.candidato_id, pedido.model_dump(mode="json")).status_code == 409
    sem_inclusao(db)


def test_candidato_inexistente_retorna_404(fluxo_aprovacao):
    db, _, _, _, pedido, cliente = fluxo_aprovacao
    with cliente("admin") as http:
        assert postar(http, 999999, pedido.model_dump(mode="json")).status_code == 404
    sem_inclusao(db)


@pytest.mark.parametrize("mudanca", ["inativo", "excluido", "rebaixado"])
def test_sessao_previa_nao_contorna_perda_de_permissao(fluxo_aprovacao, mudanca):
    db, usuarios, ref, _, pedido, cliente = fluxo_aprovacao
    with cliente("admin") as http:
        usuario = db.get(User, usuarios["admin"])
        if mudanca == "inativo":
            usuario.status = UserStatus.inactive
        elif mudanca == "excluido":
            usuario.deleted_at = datetime.now(UTC)
        else:
            usuario.role = UserRole.leitor
        db.commit()
        assert postar(http, ref.candidato_id, pedido.model_dump(mode="json")).status_code == 403
    sem_inclusao(db)


def test_replay_alterado_outro_ator_e_nova_chave_nao_duplicam_aprovacao(fluxo_aprovacao):
    db, _, ref, _, pedido, cliente = fluxo_aprovacao
    corpo = pedido.model_dump(mode="json")
    with cliente("admin") as admin, cliente("gestor") as gestor:
        assert postar(admin, ref.candidato_id, corpo).status_code == 200
        assert postar(gestor, ref.candidato_id, corpo).status_code == 409
        alterado = {**corpo, "justificativa": "Outra justificativa para a mesma chave"}
        assert postar(admin, ref.candidato_id, alterado).status_code == 409
        assert postar(admin, ref.candidato_id, {**corpo, "chave": str(uuid4())}).status_code == 409
    assert db.scalar(select(func.count()).select_from(Convenio)) == 2
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 1
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 1


def test_recaptura_posterior_exige_revisar_novamente_antes_de_aprovar(fluxo_aprovacao):
    from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada

    db, _, ref, prova, pedido, cliente = fluxo_aprovacao
    fonte = db.get(FonteCaptura, prova.fonte_captura_id)
    origem = OrigemRecapturaColetada.model_validate(fonte.detalhes).model_copy(
        update={"iniciado_em": datetime.now(UTC)}
    )
    registro = db.get(CandidatoLegadoRecaptura, prova.id)
    captura = CapturaLegadoParaPromocao.model_validate(registro.payload_oficial)
    registrar_recaptura(db=db, referencia=ref, captura=captura, origem=origem)
    with cliente("admin") as http:
        assert postar(http, ref.candidato_id, pedido.model_dump(mode="json")).status_code == 409
    sem_inclusao(db)
