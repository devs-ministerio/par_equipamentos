"""Worker local com SQL/Services reais; somente HTTP externo simulado."""

import json
from copy import deepcopy
from types import SimpleNamespace

import pytest
from requests import Response, Session
from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.db.models import FonteCaptura, Notificacao, NotificacaoDestinatario, PropostaCandidata, PropostaCandidataStatus
from scripts.recapturar_propostas_local import _recapturar_lote, executar
from tests.test_notificacoes_destinatarios_db import matriz as matriz


@pytest.fixture
def recaptura(matriz, monkeypatch):
    db, usuarios, _, _ = matriz
    dados = {}
    for identificador in (101, 102):
        db.add(
            PropostaCandidata(
                id_proposta=identificador,
                id_programa=9,
                cnpj_ente_recebedor="00000000000000",
                nm_proponente="Instituição sintética",
                ds_objeto="Anterior",
                nm_programa="Programa sintético",
                componente_batido="Componente sintético",
                status=PropostaCandidataStatus.rejeitada,
            )
        )
        dados[identificador] = {
            "id_proposta": identificador,
            "id_programa": 9,
            "cnpj_ente_recebedor": "00000000000000",
            "nm_ente_recebedor": "Instituição sintética",
            "ds_objeto": "Aquisição de Mamógrafo",
            "vl_total_planejamento_gastos": 100,
            "email": "pessoa@invalid.test",
            "cpf": "12345678901",
        }
    db.commit()
    chamadas = []

    def consultar(_self, url, *, params, timeout):
        recurso = url.rsplit("/", 1)[-1]
        chamadas.append((recurso, params.copy()))
        registros = []
        if recurso == "proposta":
            registros = [deepcopy(dados[params["id_proposta"]])]
        elif recurso == "programa":
            registros = [{"id_programa": 9, "nm_programa": "Programa sintético"}]
        resposta = Response()
        resposta.status_code = 200
        resposta._content = json.dumps({"total_pages": 1, "data": registros}).encode()
        return resposta

    monkeypatch.setattr(Session, "get", consultar)
    with Session() as sessao:
        yield db, usuarios, dados, chamadas, sessao


def capturar(cenario, *, ids=(101, 102)):
    db, _, _, _, sessao = cenario
    resultado = _recapturar_lote(db=db, sessao=sessao, limite=2, proposta_ids=ids)
    db.commit()
    return resultado


def test_baseline_silenciosa_replay_e_mudanca_agrupada_sem_alterar_revisao(recaptura):
    # Arrange
    db, usuarios, dados, chamadas, _ = recaptura
    # Act: baseline, replay, mudança de valor.
    assert capturar(recaptura) == 2
    assert list(db.scalars(select(Notificacao))) == []
    assert capturar(recaptura) == 2
    dados[101]["vl_total_planejamento_gastos"] = 120
    capturar(recaptura)
    # Assert: fonte protegida, decisão humana intacta, aviso único agrupado.
    propostas = list(db.scalars(select(PropostaCandidata).order_by(PropostaCandidata.id_proposta)))
    assert [p.status for p in propostas] == [PropostaCandidataStatus.rejeitada] * 2
    assert propostas[0].metas_resumo["proposta"]["email"] == "[dado pessoal protegido]"
    assert propostas[0].metas_resumo["proposta"]["cpf"] == "[dado pessoal protegido]"
    assert propostas[0].vl_global_proposta == 120
    avisos = list(db.scalars(select(Notificacao)))
    assert len(avisos) == 1 and "100 → 120" in avisos[0].corpo
    assert "pessoa@invalid.test" not in avisos[0].corpo
    destinos = set(db.scalars(select(NotificacaoDestinatario.usuario_id)))
    assert destinos == {usuarios[n].id for n in ("admin", "gestor", "titular", "suplente", "outro")}
    rodadas = list(db.scalars(select(FonteCaptura).order_by(FonteCaptura.id)))
    assert [(r.itens_verificados, r.itens_alterados, r.avisos_criados) for r in rodadas] == [
        (2, 2, 0),
        (2, 0, 0),
        (2, 1, 1),
    ]
    assert all(params.get("id_proposta", 101) in (101, 102) for recurso, params in chamadas if recurso == "proposta")


@pytest.mark.parametrize(
    "campo,valor", [("id_proposta", 999), ("id_programa", 8), ("vl_total_planejamento_gastos", -1)]
)
def test_falha_na_segunda_proposta_reverte_primeira_e_nao_publica_captura(recaptura, campo, valor):
    # Arrange: a primeira proposta seria alterada antes da falha na segunda.
    db, _, dados, _, sessao = recaptura
    dados[102][campo] = valor
    # Act
    with pytest.raises(ValueError):
        _recapturar_lote(db=db, sessao=sessao, limite=2, proposta_ids=(101, 102))
    db.rollback()
    # Assert
    propostas = list(db.scalars(select(PropostaCandidata)))
    assert all(p.metas_resumo is None and p.ds_objeto == "Anterior" for p in propostas)
    assert list(db.scalars(select(Notificacao))) == []
    assert list(db.scalars(select(FonteCaptura))) == []


def test_selecao_desconhecida_falha_antes_de_consultar_api(recaptura):
    # Arrange
    db, _, _, chamadas, sessao = recaptura
    # Act
    with pytest.raises(ValueError, match="desconhecida"):
        _recapturar_lote(db=db, sessao=sessao, limite=2, proposta_ids=(101, 999))
    db.rollback()
    # Assert
    assert chamadas == []
    assert list(db.scalars(select(FonteCaptura))) == []


def test_worker_publico_reverte_lote_e_registra_falha_gerencial_sem_segredos(recaptura, monkeypatch):
    # Arrange: conexão de teste real, isolada em schema descartável.
    from app.db import base

    db, usuarios, dados, _, _ = recaptura
    fabrica = sessionmaker(bind=db.get_bind())
    monkeypatch.setattr(base, "SessionLocal", fabrica)
    url = "postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006_api_1234abcd"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_URL_MIGRATION", url)
    monkeypatch.setattr(base, "engine", SimpleNamespace(url=make_url(url)))
    dados[102]["vl_total_planejamento_gastos"] = -1
    # Act: somente fábrica de conexão/HTTP externos substituídos; domínio real.
    with pytest.raises(ValueError):
        executar(limite=2, proposta_ids=(101, 102))
    db.expire_all()
    # Assert
    assert all(p.metas_resumo is None for p in db.scalars(select(PropostaCandidata)))
    rodadas = list(db.scalars(select(FonteCaptura)))
    assert len(rodadas) == 1 and rodadas[0].status == "erro"
    assert "cpf" not in rodadas[0].erro and "12345678901" not in rodadas[0].erro
    destinos = set(db.scalars(select(NotificacaoDestinatario.usuario_id)))
    assert destinos == {usuarios["admin"].id, usuarios["gestor"].id}


def test_worker_recusa_engine_precarregada_em_outro_banco_antes_do_http(recaptura, monkeypatch):
    # Arrange: env aponta a staging, mas a conexão em cache é do banco de teste.
    db, _, _, chamadas, _ = recaptura
    url = "postgresql://local@127.0.0.1/sigeo_homologacao_base_20261006_api_1234abcd"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_URL_MIGRATION", url)
    # Act / Assert
    with pytest.raises(ValueError, match="staging exclusivo|Conexão carregada"):
        executar(limite=2, proposta_ids=(101, 102))
    assert chamadas == []
    assert list(db.scalars(select(FonteCaptura))) == []


@pytest.mark.parametrize(
    "recurso", ["meta-proposta", "cronograma-desembolso", "analise-proposta", "distribuicao-recurso-proposta"]
)
def test_resposta_filha_omitida_reverte_lote_preserva_baseline_e_nao_notifica(recaptura, monkeypatch, recurso):
    # Arrange: baseline íntegra; a primeira proposta mudaria antes da falha da segunda.
    db, _, dados, _, sessao = recaptura
    capturar(recaptura)
    anteriores = {p.id_proposta: deepcopy(p.metas_resumo) for p in db.scalars(select(PropostaCandidata))}
    rodadas = list(db.scalars(select(FonteCaptura.id)))
    dados[101]["vl_total_planejamento_gastos"] = 120
    consultar_original = Session.get

    def consultar(self, url, *, params, timeout):
        if url.endswith("/" + recurso) and params.get("id_proposta") == 102:
            resposta = Response()
            resposta.status_code = 200
            resposta._content = b"{}"
            return resposta
        return consultar_original(self, url, params=params, timeout=timeout)

    monkeypatch.setattr(Session, "get", consultar)
    # Act
    with pytest.raises(ValueError, match="Envelope paginado"):
        _recapturar_lote(db=db, sessao=sessao, limite=2, proposta_ids=(101, 102))
    db.rollback()
    # Assert: prova anterior, valor, revisão humana e avisos são atômicos.
    propostas = list(db.scalars(select(PropostaCandidata)))
    assert {p.id_proposta: p.metas_resumo for p in propostas} == anteriores
    assert all(p.vl_global_proposta == 100 and p.status == PropostaCandidataStatus.rejeitada for p in propostas)
    assert list(db.scalars(select(FonteCaptura.id))) == rodadas
    assert list(db.scalars(select(Notificacao))) == []
