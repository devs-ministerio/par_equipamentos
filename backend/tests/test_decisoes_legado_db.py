"""Triagem real em PostgreSQL; rollback externo preserva auditoria imutável."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import create_access_token, create_refresh_token, hash_password
from app.db.base import engine, get_db
from app.db.models import Convenio, InstrumentoEquipamento, User, UserRole, UserStatus
from app.db.models_legado import CandidatoLegadoDecisao
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError
from app.main import app
from app.schemas_legado import DecisaoLegadoCreate, ReferenciaDescoberta
from app.services.candidatos_legados import listar_candidatos, registrar_descoberta
from app.services.decisoes_legado import consultar_historico, registrar_decisao
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado


@pytest.fixture
def triagem():
    with engine.connect() as conexao:
        transacao = conexao.begin()
        db = Session(bind=conexao, join_transaction_mode="create_savepoint", expire_on_commit=False)
        usuario = User(
            name="Gestor sintético",
            email=f"pytest-radar-{uuid4()}@example.com",
            password_hash=hash_password("senha-sintetica"),
            role=UserRole.gestor,
        )
        db.add(usuario)
        db.flush()
        candidato = CandidatoLegado(
            numero=str(uuid4().int),
            id_proposta=str(uuid4().int),
            evidencias=(
                EvidenciaLegado(
                    id_item="1",
                    codigo_equipamento="acelerador_linear",
                    descricao="Aquisição sintética de LINAC",
                    relacao="aquisicao",
                ),
            ),
        )
        registrar_descoberta(
            db=db,
            candidatos=[candidato],
            referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="b" * 64),
        )
        item = listar(db, candidato.numero).itens[0]
        yield db, usuario, candidato, item
        db.close()
        transacao.rollback()


def listar(db, numero, situacao=None):
    return listar_candidatos(
        db=db, pagina=1, tamanho=10, busca=numero, confirmacao=None, situacao=situacao, somente_oficiais=True
    )


def comando(item, acao="iniciar_analise", **alteracoes):
    return DecisaoLegadoCreate.model_validate(
        {
            "acao": acao,
            "chave": uuid4(),
            "captura_id": item.captura_id,
            "versao": item.versao,
            "justificativa": "Conferência pela equipe",
            **alteracoes,
        }
    )


def decidir(db, usuario, item, dados):
    return registrar_decisao(db=db, usuario=usuario, candidato_id=item.id, dados=dados)


def test_analise_rejeicao_historico_e_badge_sem_inclusao(triagem):
    db, usuario, _, item = triagem
    contagens = [db.scalar(select(func.count()).select_from(t)) for t in (Convenio, InstrumentoEquipamento)]
    novos = listar(db, item.numero).novos
    assert item.situacao == "novo" and item.versao == 0
    analise = decidir(db, usuario, item, comando(item))
    atualizado = listar(db, item.numero, "em_analise").itens[0]
    assert atualizado.versao == analise.id and listar(db, item.numero).novos == novos - 1
    rejeicao = decidir(db, usuario, atualizado, comando(atualizado, "rejeitar"))
    historico = consultar_historico(db=db, candidato_id=item.id, pagina=1, tamanho=1)
    assert historico.total == 2 and historico.itens[0].id == rejeicao.id
    assert historico.itens[0].usuario_nome == usuario.name
    assert consultar_historico(db=db, candidato_id=item.id, pagina=2, tamanho=1).itens[0].id == analise.id
    assert consultar_historico(db=db, candidato_id=item.id, pagina=3, tamanho=1).itens == []
    assert listar(db, item.numero, "novo").total == 0
    assert listar(db, item.numero, "rejeitado").total == 1
    assert [db.scalar(select(func.count()).select_from(t)) for t in (Convenio, InstrumentoEquipamento)] == contagens


@pytest.mark.parametrize("role", [UserRole.gestor, UserRole.admin])
def test_replay_mesma_chave_nao_duplica_e_chave_divergente_conflita(triagem, role):
    db, usuario, _, item = triagem
    usuario.role = role
    dados = comando(item)
    primeira = decidir(db, usuario, item, dados)
    assert decidir(db, usuario, item, dados).id == primeira.id
    with pytest.raises(ConflictError, match="Chave"):
        decidir(db, usuario, item, dados.model_copy(update={"justificativa": "Outra razão"}))
    assert consultar_historico(db=db, candidato_id=item.id, pagina=1, tamanho=10).total == 1


@pytest.mark.parametrize(
    "role,status",
    [
        (UserRole.leitor, UserStatus.active),
        (UserRole.colaborador, UserStatus.active),
        (UserRole.admin, UserStatus.suspended),
    ],
)
def test_permissao_verificada_no_service_antes_da_decisao(triagem, role, status):
    db, usuario, _, item = triagem
    usuario.role, usuario.status = role, status
    with pytest.raises(AuthorizationError):
        decidir(db, usuario, item, comando(item))
    assert consultar_historico(db=db, candidato_id=item.id, pagina=1, tamanho=10).total == 0


def test_captura_nova_versao_obsoleta_e_estado_encerrado_bloqueados(triagem):
    db, usuario, candidato, item = triagem
    mudou = candidato.model_copy(
        update={"evidencias": (candidato.evidencias[0].model_copy(update={"descricao": "Descrição oficial revisada"}),)}
    )
    registrar_descoberta(
        db=db, candidatos=[mudou], referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="c" * 64)
    )
    with pytest.raises(ConflictError, match="mudou"):
        decidir(db, usuario, item, comando(item))
    atual = listar(db, item.numero).itens[0]
    decidir(db, usuario, atual, comando(atual))
    with pytest.raises(ConflictError, match="mudou"):
        decidir(db, usuario, atual, comando(atual, "rejeitar"))
    atual = listar(db, item.numero).itens[0]
    with pytest.raises(ConflictError, match="situação"):
        decidir(db, usuario, atual, comando(atual))
    decidir(db, usuario, atual, comando(atual, "rejeitar"))
    atual = listar(db, item.numero).itens[0]
    with pytest.raises(ConflictError, match="situação"):
        decidir(db, usuario, atual, comando(atual, "rejeitar"))


def test_snapshot_local_nao_entra_na_fila_nem_aceita_decisao(triagem):
    db, usuario, candidato, _ = triagem
    registrar_descoberta(
        db=db, candidatos=[candidato], referencia=ReferenciaDescoberta(origem="snapshot_local", hash_snapshot="d" * 64)
    )
    assert listar(db, candidato.numero).total == 0
    item = listar_candidatos(db=db, pagina=1, tamanho=10, busca=candidato.numero, confirmacao=None).itens[0]
    with pytest.raises(ConflictError, match="fonte oficial"):
        decidir(db, usuario, item, comando(item))


@pytest.mark.parametrize("operacao", ["update", "delete"])
def test_banco_impede_alterar_ou_apagar_decisao(triagem, operacao):
    db, usuario, _, item = triagem
    decisao = decidir(db, usuario, item, comando(item))
    with pytest.raises(IntegrityError), db.begin_nested():
        consulta = (
            update(CandidatoLegadoDecisao).values(justificativa="Alteração indevida")
            if operacao == "update"
            else delete(CandidatoLegadoDecisao)
        )
        db.execute(consulta.where(CandidatoLegadoDecisao.id == decisao.id))
    assert (
        consultar_historico(db=db, candidato_id=item.id, pagina=1, tamanho=10).itens[0].justificativa
        == "Conferência pela equipe"
    )


def test_banco_rejeita_captura_de_outro_candidato(triagem):
    db, usuario, candidato, item = triagem
    outro = candidato.model_copy(update={"numero": str(uuid4().int), "id_proposta": str(uuid4().int)})
    registrar_descoberta(
        db=db, candidatos=[outro], referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="e" * 64)
    )
    captura_outro = listar(db, outro.numero).itens[0].captura_id
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(
            CandidatoLegadoDecisao(
                candidato_id=item.id,
                captura_id=captura_outro,
                usuario_id=usuario.id,
                chave=uuid4(),
                situacao_anterior="novo",
                situacao="rejeitado",
                justificativa="Razão sintética",
            )
        )
        db.flush()


def test_rotas_autenticacao_csrf_validacao_permissao_e_historico(triagem):
    db, usuario, _, item = triagem
    app.dependency_overrides[get_db] = lambda: db
    try:
        cliente = TestClient(app)
        assert cliente.get(f"/candidatos-legados/{item.id}/historico").status_code == 401
        _, sid = create_refresh_token(db, usuario)
        db.commit()
        token = create_access_token(usuario, sid)
        headers = {"Cookie": f"sigeo_access={token}; sigeo_csrf=fixture-csrf", "X-CSRF-Token": "fixture-csrf"}
        url = f"/candidatos-legados/{item.id}/decisoes"
        dados = comando(item).model_dump(mode="json")
        assert cliente.post(url, json=dados, headers={"Cookie": headers["Cookie"]}).status_code == 403
        assert cliente.post(url, json={**dados, "acao": "aprovar"}, headers=headers).status_code == 422
        assert cliente.post(url, json={**dados, "justificativa": "  "}, headers=headers).status_code == 422
        usuario.role = UserRole.colaborador
        db.commit()
        assert cliente.post(url, json=dados, headers=headers).status_code == 403
        usuario.role = UserRole.gestor
        db.commit()
        resposta = cliente.post(url, json=dados, headers=headers)
        assert resposta.status_code == 200 and resposta.json()["situacao"] == "em_analise"
        assert (
            cliente.post(url, json=comando(item, "rejeitar").model_dump(mode="json"), headers=headers).status_code
            == 409
        )
        assert cliente.get(f"/candidatos-legados/{item.id}/historico", headers=headers).json()["total"] == 1
        assert cliente.get(f"/candidatos-legados/{item.id}/historico?pagina=0", headers=headers).status_code == 422
        assert cliente.get("/candidatos-legados/999999999999/historico", headers=headers).status_code == 404
        assert cliente.post("/candidatos-legados/999999999999/decisoes", json=dados, headers=headers).status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_candidato_ausente_gera_erro_de_dominio(triagem):
    db, usuario, _, item = triagem
    with pytest.raises(NotFoundError):
        registrar_decisao(db=db, usuario=usuario, candidato_id=999999999999, dados=comando(item))
