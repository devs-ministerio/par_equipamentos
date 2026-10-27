"""Mesmo ZIP → classificação → descoberta/revalidação/avisos atômicos, SQL real."""

from functools import partial
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

import pytest
import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.models import Convenio, FonteCaptura, InstrumentoEquipamento, Notificacao
from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoRegistro
from app.domain_errors import ConflictError, ValidationError
from app.schemas_legado import DecisaoLegadoCreate, ReferenciaDescoberta
from app.schemas_revalidacao_legado import RevalidacaoPreparada, RevalidacoesCiclo
from app.services.candidatos_legados import registrar_descoberta
from app.services.capturas_fonte import captura
from app.services.ciclo_descoberta_legado import publicar_ciclo, selecionar_revalidacoes
from app.services.decisoes_legado import registrar_decisao
from scripts import job_descoberta_siconv as job
from tests.test_coletar_recaptura_legado import csv_zip
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import candidato
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_recapturas_legado_service_db import preparar
from tests.test_revalidacao_legado_db import prova


def contar(db, modelo):
    return db.scalar(select(func.count()).select_from(modelo))


@pytest.fixture
def ciclo(matriz, dados, monkeypatch):
    db, usuarios, *_ = matriz
    ref, _, _ = preparar(db, dados)
    novo = {**dados["convenio"], "NR_CONVENIO": "999002", "ID_PROPOSTA": "111002"}
    linhas = {
        "siconv_convenio": (
            [dados["convenio"], novo],
            ["NR_CONVENIO", "ID_PROPOSTA", "DIA_ASSIN_CONV", "DIA_PUBL_CONV", "SIT_CONVENIO"],
        ),
        "siconv_proposta": (
            [dados["proposta"], {"ID_PROPOSTA": "111002", "COD_ORGAO_SUP": "36000"}],
            ["ID_PROPOSTA", "COD_ORGAO_SUP"],
        ),
        "siconv_plano_aplicacao": (
            [
                {"ID_PROPOSTA": "111001", "ID_ITEM_PAD": "1", "DESCRICAO_ITEM": "Curso sobre acelerador linear"},
                {"ID_PROPOSTA": "111002", "ID_ITEM_PAD": "2", "DESCRICAO_ITEM": "Aquisição de mamógrafo"},
            ],
            ["ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"],
        ),
        "siconv_programa_proposta": ([], ["ID_PROPOSTA", "ID_PROGRAMA"]),
        "siconv_programa": ([], ["ID_PROGRAMA", "NOME_PROGRAMA", "COD_ORGAO_SUP_PROGRAMA"]),
    }
    chamadas = []
    caches = []
    consultas = []
    sessoes: list[Session] = []

    class SessaoObservada(Session):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            sessoes.append(self)

    fabrica = sessionmaker(bind=db.get_bind(), class_=SessaoObservada)

    def baixar(nome, *, atualizar_cache, diretorio_cache):
        assert all(not s.in_transaction() for s in sessoes)
        assert atualizar_cache is True and isinstance(diretorio_cache, Path)
        chamadas.append(nome)
        caches.append(diretorio_cache)
        conteudo = csv_zip(*linhas[nome])
        (diretorio_cache / f"{nome}.csv.zip").write_bytes(conteudo)
        return conteudo

    def consultar(sessao, url, *, params, headers, timeout):
        import json

        assert all(not s.in_transaction() for s in sessoes)
        consultas.append(params["numero"])
        resposta = requests.Response()
        resposta.status_code = 200
        resposta._content = json.dumps(
            {
                "dimConvenio": {"codigo": params["numero"], "numero": "1/2026", "objeto": "Aquisição de mamógrafo"},
                "dataPublicacao": "02/10/2026",
            }
        ).encode()
        return resposta

    monkeypatch.setattr(job, "SessionLocal", fabrica)
    monkeypatch.setattr(job, "captura", partial(captura, fabrica_sessao=fabrica))
    monkeypatch.setattr(job, "_baixar_zip", baixar)
    monkeypatch.setattr(requests.Session, "get", consultar)
    monkeypatch.setattr(settings, "portal_transparencia_api_key", "chave-sintetica")
    return db, usuarios, ref, linhas, chamadas, caches, consultas


def test_mesma_rodada_descobre_novo_oculta_curso_e_notifica_sem_financeiro(ciclo):
    # Arrange
    db, _, ref, _, chamadas, caches, consultas = ciclo
    # Act
    job.run()
    # Assert
    db.expire_all()
    antigo = db.get(CandidatoLegadoRegistro, ref.candidato_id)
    assert db.get(CandidatoLegadoCaptura, antigo.ultima_captura_id).elegivel is False
    assert db.get(CandidatoLegadoCaptura, ref.captura_id).elegivel is True
    assert db.scalar(select(CandidatoLegadoRegistro.id).where(CandidatoLegadoRegistro.numero == "999002")) is not None
    assert contar(db, CandidatoLegadoCaptura) == 3 and contar(db, Notificacao) == 1
    assert contar(db, Convenio) == contar(db, InstrumentoEquipamento) == 1
    assert len(chamadas) == len(set(chamadas)) == 5 and consultas == ["999002"]
    assert all(not cache.exists() for cache in caches)
    assert list(db.scalars(select(FonteCaptura.status))) == ["ok", "ok"]


def test_replay_do_job_nao_repete_ocultacao_aviso_ou_download_por_candidato(ciclo):
    # Arrange
    db, *_ = ciclo
    job.run()
    db.rollback()
    # Act
    job.run()
    # Assert
    assert contar(db, CandidatoLegadoCaptura) == 3 and contar(db, Notificacao) == 1
    rodadas = list(
        db.scalars(select(FonteCaptura).where(FonteCaptura.fonte == "siconv_descoberta").order_by(FonteCaptura.id))
    )
    assert [r.itens_alterados for r in rodadas] == [2, 0]
    assert len(ciclo[4]) == 10


@pytest.mark.parametrize("campo", ["numero", "objeto"])
def test_portal_incompleto_sinaliza_parcial_sem_publicar_ou_mudar_fila_anterior(ciclo, monkeypatch, campo):
    # Arrange: HTTP responde 200 e publicação, mas não comprova identidade completa.
    import json

    from app.db.models import NotificacaoTipo

    db, _, ref, *_ = ciclo
    consultar = requests.Session.get
    antes = contar(db, CandidatoLegadoRegistro), contar(db, CandidatoLegadoCaptura)

    def incompleto(self, url, **kwargs):
        resposta = consultar(self, url, **kwargs)
        payload = resposta.json()
        payload["dimConvenio"][campo] = ""
        resposta._content = json.dumps(payload).encode()
        return resposta

    monkeypatch.setattr(requests.Session, "get", incompleto)
    # Act / Assert: não confundir incompletude com sucesso vazio/inelegibilidade.
    with pytest.raises(ValueError, match="Ciclo parcial"):
        job.run()
    db.expire_all()
    assert (contar(db, CandidatoLegadoRegistro), contar(db, CandidatoLegadoCaptura)) == antes
    assert db.get(CandidatoLegadoRegistro, ref.candidato_id).ultima_captura_id == ref.captura_id
    rodada = db.scalar(select(FonteCaptura).where(FonteCaptura.fonte == "siconv_descoberta"))
    assert rodada.status == "parcial"
    assert len(rodada.detalhes["confirmacoes_inconclusivas"]) == 1
    assert rodada.detalhes["revalidacoes_adiadas_portal"] == 1
    assert (
        db.scalar(
            select(func.count()).select_from(Notificacao).where(Notificacao.tipo == NotificacaoTipo.convenio_descoberto)
        )
        == 0
    )


def test_contrato_parcial_publica_novo_valido_sem_ocultar_fila_historica(ciclo, monkeypatch):
    # Arrange: um novo candidato incompleto e outro comprovado na mesma fonte.
    import json

    db, _, ref, linhas, *_ = ciclo
    linhas["siconv_convenio"][0].append(
        {**linhas["siconv_convenio"][0][1], "NR_CONVENIO": "999003", "ID_PROPOSTA": "111003"}
    )
    linhas["siconv_proposta"][0].append({"ID_PROPOSTA": "111003", "COD_ORGAO_SUP": "36000"})
    linhas["siconv_plano_aplicacao"][0].append(
        {"ID_PROPOSTA": "111003", "ID_ITEM_PAD": "3", "DESCRICAO_ITEM": "Aquisição de mamógrafo"}
    )
    consultar = requests.Session.get

    def resposta_parcial(self, url, **kwargs):
        resposta = consultar(self, url, **kwargs)
        if kwargs["params"]["numero"] == "999002":
            payload = resposta.json()
            payload["dimConvenio"]["objeto"] = ""
            resposta._content = json.dumps(payload).encode()
        return resposta

    monkeypatch.setattr(requests.Session, "get", resposta_parcial)
    # Act
    with pytest.raises(ValueError, match="Ciclo parcial"):
        job.run()
    # Assert: parcial explícita, um registro novo íntegro e histórico imutável.
    db.expire_all()
    assert db.get(CandidatoLegadoRegistro, ref.candidato_id).ultima_captura_id == ref.captura_id
    assert db.scalar(select(CandidatoLegadoRegistro.id).where(CandidatoLegadoRegistro.numero == "999002")) is None
    valido = db.scalar(select(CandidatoLegadoRegistro).where(CandidatoLegadoRegistro.numero == "999003"))
    assert db.get(CandidatoLegadoCaptura, valido.ultima_captura_id).confirmacao_portal == "confirmado"
    assert contar(db, CandidatoLegadoCaptura) == 2
    rodada = db.scalar(select(FonteCaptura).where(FonteCaptura.fonte == "siconv_descoberta"))
    assert rodada.status == "parcial" and rodada.itens_alterados == 1
    assert rodada.detalhes["publicacao"] == "concluida"


@pytest.mark.parametrize("omitido", ["convenio", "proposta", "itens"])
def test_ausencia_oficial_nao_vira_inelegibilidade_mas_ciclo_sinaliza_parcial(ciclo, omitido):
    # Arrange
    db, _, ref, linhas, *_ = ciclo
    arquivo = {"convenio": "siconv_convenio", "proposta": "siconv_proposta", "itens": "siconv_plano_aplicacao"}[omitido]
    chave = "NR_CONVENIO" if omitido == "convenio" else "ID_PROPOSTA"
    valor = "999001" if omitido == "convenio" else "111001"
    linhas[arquivo] = ([r for r in linhas[arquivo][0] if r[chave] != valor], linhas[arquivo][1])
    # Act / Assert
    with pytest.raises(ValueError, match="Ciclo parcial"):
        job.run()
    db.expire_all()
    assert db.get(CandidatoLegadoRegistro, ref.candidato_id).ultima_captura_id == ref.captura_id
    assert contar(db, CandidatoLegadoCaptura) == 2  # somente a descoberta nova confirmada
    rodada = db.scalar(select(FonteCaptura).where(FonteCaptura.fonte == "siconv_descoberta"))
    assert rodada.status == "parcial" and rodada.detalhes["revalidacoes_inconclusivas"] == 1


def test_decisao_concorrente_reverte_novo_e_aviso_sem_alerta_falso(ciclo, monkeypatch):
    # Arrange
    db, usuarios, ref, *_ = ciclo
    admin_id = usuarios["admin"].id
    consultar = requests.Session.get
    fabrica = sessionmaker(bind=db.get_bind())
    db.rollback()

    def rejeitar(sessao, *args, **kwargs):
        with fabrica() as outra:
            from app.db.models import User

            usuario = outra.get(User, admin_id)
            assert usuario is not None
            registrar_decisao(
                db=outra,
                usuario=usuario,
                candidato_id=ref.candidato_id,
                dados=DecisaoLegadoCreate(
                    acao="rejeitar",
                    chave=uuid4(),
                    captura_id=ref.captura_id,
                    versao=0,
                    justificativa="Análise concorrente",
                ),
            )
        return consultar(sessao, *args, **kwargs)

    monkeypatch.setattr(requests.Session, "get", rejeitar)
    # Act / Assert
    with pytest.raises(ConflictError, match="encerrada"):
        job.run()
    db.expire_all()
    assert contar(db, CandidatoLegadoRegistro) == contar(db, CandidatoLegadoCaptura) == 1
    assert contar(db, Notificacao) == 0
    rodada = db.scalar(select(FonteCaptura))
    assert rodada.status == "ok" and rodada.detalhes["publicacao"] == "conflito_revisao"


def test_selecao_tem_teto_e_nao_trunca_fila(ciclo, dados):
    # Arrange
    db, *_ = ciclo
    # Act / Assert
    with pytest.raises(ValidationError):
        selecionar_revalidacoes(db=db, limite=0)
    assert len(selecionar_revalidacoes(db=db, limite=1)) == 1
    registrar_descoberta(
        db=db,
        candidatos=[candidato(dados).model_copy(update={"numero": "999003", "id_proposta": "111003"})],
        referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="a" * 64),
        notificar_novos=False,
    )
    with pytest.raises(ValidationError, match="Fila excedeu"):
        selecionar_revalidacoes(db=db, limite=1)
    assert not db.in_transaction()


def test_portal_falha_apos_preparacao_negativa_nao_publica_nada(ciclo, monkeypatch):
    # Arrange
    db, _, ref, *_ = ciclo

    def indisponivel(*args, **kwargs):
        resposta = requests.Response()
        resposta.status_code = 500
        return resposta

    monkeypatch.setattr(requests.Session, "get", indisponivel)
    # Act / Assert
    with pytest.raises(requests.HTTPError):
        job.run()
    db.expire_all()
    assert db.get(CandidatoLegadoRegistro, ref.candidato_id).ultima_captura_id == ref.captura_id
    assert contar(db, CandidatoLegadoRegistro) == contar(db, CandidatoLegadoCaptura) == 1
    assert db.scalar(select(FonteCaptura.status)) == "erro"


def test_erro_na_segunda_revalidacao_reverte_primeira_descoberta_e_avisos(ciclo, dados, monkeypatch):
    # Arrange
    db, usuarios, ref, linhas, *_ = ciclo
    registrar_descoberta(
        db=db,
        candidatos=[candidato(dados).model_copy(update={"numero": "999003", "id_proposta": "111003"})],
        referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="a" * 64),
        notificar_novos=False,
    )
    terceiro = db.scalar(select(CandidatoLegadoRegistro).where(CandidatoLegadoRegistro.numero == "999003"))
    terceiro_id, terceira_captura = terceiro.id, terceiro.ultima_captura_id
    linhas["siconv_convenio"][0].append({**dados["convenio"], "NR_CONVENIO": "999003", "ID_PROPOSTA": "111003"})
    linhas["siconv_proposta"][0].append({"ID_PROPOSTA": "111003", "COD_ORGAO_SUP": "36000"})
    linhas["siconv_plano_aplicacao"][0].append(
        {"ID_PROPOSTA": "111003", "ID_ITEM_PAD": "3", "DESCRICAO_ITEM": "Curso sobre acelerador linear"}
    )
    consultar = requests.Session.get
    admin_id = usuarios["admin"].id
    fabrica = sessionmaker(bind=db.get_bind())
    db.rollback()

    def decidir(sessao, *args, **kwargs):
        from app.db.models import User

        with fabrica() as outra:
            usuario = outra.get(User, admin_id)
            assert usuario is not None
            registrar_decisao(
                db=outra,
                usuario=usuario,
                candidato_id=terceiro_id,
                dados=DecisaoLegadoCreate(
                    acao="rejeitar",
                    chave=uuid4(),
                    captura_id=terceira_captura,
                    versao=0,
                    justificativa="Revisão concorrente",
                ),
            )
        return consultar(sessao, *args, **kwargs)

    monkeypatch.setattr(requests.Session, "get", decidir)
    # Act / Assert
    with pytest.raises(ConflictError, match="encerrada"):
        job.run()
    db.expire_all()
    assert db.get(CandidatoLegadoRegistro, ref.candidato_id).ultima_captura_id == ref.captura_id
    assert contar(db, CandidatoLegadoRegistro) == contar(db, CandidatoLegadoCaptura) == 2
    assert contar(db, FonteCaptura) == 1 and contar(db, Notificacao) == 0


@pytest.mark.parametrize("defeito", ["origem", "sobreposicao", "snapshot", "mistura"])
def test_contrato_do_ciclo_nao_aceita_provas_de_rodadas_diferentes(ciclo, dados, defeito):
    # Arrange
    db, *_ = ciclo
    alvo = selecionar_revalidacoes(db=db)[0]
    positivo = candidato(dados).model_copy(update={"numero": "999002", "id_proposta": "111002"})
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    escopo = prova(dados)
    entrada = RevalidacaoPreparada(alvo=alvo, escopo=escopo)
    entradas = [entrada]
    referencia = ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot=sha256(("a" * 128).encode()).hexdigest())
    notificar = True
    if defeito == "origem":
        referencia = referencia.model_copy(update={"origem": "snapshot_local"})
    if defeito == "sobreposicao":
        positivo = positivo.model_copy(update={"numero": alvo.numero})
    if defeito == "snapshot":
        referencia = referencia.model_copy(update={"hash_snapshot": "f" * 64})
    if defeito == "mistura":
        segunda = escopo.model_copy(update={"hashes": {**escopo.hashes, "siconv_proposta": "f" * 64}})
        outro = alvo.model_copy(update={"candidato_id": 99999, "numero": "999003", "id_proposta": "111003"})
        entradas.append(RevalidacaoPreparada(alvo=outro, escopo=segunda))
    # Act / Assert
    with pytest.raises(ValidationError):
        publicar_ciclo(
            db=db,
            candidatos=[positivo],
            referencia=referencia,
            revalidacoes=RevalidacoesCiclo(entradas=tuple(entradas), inconclusivos=()),
            notificar_novos=notificar,
        )
    assert contar(db, CandidatoLegadoRegistro) == contar(db, CandidatoLegadoCaptura) == 1
    assert contar(db, FonteCaptura) == contar(db, Notificacao) == 0
