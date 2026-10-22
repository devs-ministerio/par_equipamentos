"""Coletor sintético + Service + PostgreSQL real, sem HTTP ou aprovação."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Convenio, EquipamentoCatalogo, FonteCaptura, InstrumentoEquipamento
from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoRecaptura, CandidatoLegadoRegistro
from app.domain_errors import ConflictError, NotFoundError
from app.schemas_filhas_legado import CHAVES_FILHAS
from app.schemas_legado import ReferenciaDescoberta
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada
from app.schemas_recaptura_persistencia import ReferenciaRecaptura
from app.services.candidatos_legados import registrar_descoberta
from app.services.recapturas_legado import registrar_recaptura
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import candidato
from tests.test_prova_recaptura_legado import dados as dados


def preparar(db, dados, *, notificar_novos=False):
    db.add(EquipamentoCatalogo(codigo="mamografo", nome="Mamógrafo", prioritario=True))
    db.commit()
    registrar_descoberta(
        db=db,
        candidatos=[candidato(dados)],
        referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="a" * 64),
        # Baseline sintética anterior à transação sob teste; não apagar avisos
        # para isolar aprovação/recaptura. A carga inicial é explicitamente silenciosa.
        notificar_novos=notificar_novos,
    )
    registro = db.scalar(select(CandidatoLegadoRegistro))
    referencia = ReferenciaRecaptura(candidato_id=registro.id, captura_id=registro.ultima_captura_id)
    captura = CapturaLegadoParaPromocao.model_validate(dados)
    origem = OrigemRecapturaColetada(
        iniciado_em=datetime.now(UTC),
        hash_convenios="b" * 64,
        hash_itens="c" * 64,
        hash_proposta="d" * 64,
        hashes_filhas={c: "e" * 64 for c in CHAVES_FILHAS},
        hashes_programas={c: "f" * 64 for c in ("siconv_programa_proposta", "siconv_programa")},
        payload_protegido_local=True,
    )
    db.commit()
    return referencia, captura, origem


def quantidade(db, modelo):
    return db.scalar(select(func.count()).select_from(modelo))


def test_grava_prova_rodada_e_replay_sem_incluir_na_carteira(matriz, dados):
    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    antes = (quantidade(db, Convenio), quantidade(db, InstrumentoEquipamento))
    resultado = registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    repetido = registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    assert repetido == resultado
    assert quantidade(db, CandidatoLegadoRecaptura) == quantidade(db, FonteCaptura) == 1
    prova = db.get(CandidatoLegadoRecaptura, resultado.id)
    rodada = db.get(FonteCaptura, resultado.fonte_captura_id)
    assert prova.payload_oficial == captura.model_dump(mode="json")
    assert rodada.detalhes == origem.model_dump(mode="json") and rodada.status == "ok"
    assert (quantidade(db, Convenio), quantidade(db, InstrumentoEquipamento)) == antes


@pytest.mark.parametrize("defeito", ["hash_fonte", "valor", "situacao"])
def test_mesma_tentativa_com_outros_dados_conflita_sem_sobrescrever(matriz, dados, defeito):
    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    original = registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    if defeito == "hash_fonte":
        origem = origem.model_copy(update={"hash_itens": "0" * 64})
    else:
        campo = "VL_GLOBAL_CONV" if defeito == "valor" else "SIT_CONVENIO"
        dados["convenio"][campo] = "2000" if defeito == "valor" else "Prestação de Contas Concluída"
        captura = CapturaLegadoParaPromocao.model_validate(dados)
    with pytest.raises(ConflictError):
        registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    assert quantidade(db, CandidatoLegadoRecaptura) == quantidade(db, FonteCaptura) == 1
    assert db.get(CandidatoLegadoRecaptura, original.id).situacao == "Em execução"


@pytest.mark.parametrize("defeito", ["expirada", "futura", "naive", "ausente", "captura_antiga", "obra", "nao_ms"])
def test_precondicao_invalida_nao_deixa_rodada_ok(matriz, dados, defeito):
    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    if defeito in ("expirada", "futura", "naive"):
        horario = datetime.now(UTC)
        if defeito == "expirada":
            horario -= timedelta(hours=25)
        elif defeito == "futura":
            horario += timedelta(hours=1)
        else:
            horario = horario.replace(tzinfo=None)
        origem = origem.model_copy(update={"iniciado_em": horario})
    elif defeito == "ausente":
        referencia = referencia.model_copy(update={"candidato_id": 999999})
    elif defeito == "captura_antiga":
        referencia = referencia.model_copy(update={"captura_id": 999999})
    else:
        if defeito == "obra":
            dados["itens"][0]["DESCRICAO_ITEM"] = "Construção de hospital com sala de mamografia"
        else:
            dados["proposta"]["COD_ORGAO_SUP"] = "51000"
        captura = CapturaLegadoParaPromocao.model_validate(dados)
    with pytest.raises((ConflictError, NotFoundError, ValidationError)):
        registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    assert quantidade(db, FonteCaptura) == quantidade(db, CandidatoLegadoRecaptura) == 0


@pytest.mark.parametrize("campo,valor", [("origem", "snapshot_local"), ("elegivel", False)])
def test_descoberta_nao_oficial_ou_inelegivel_bloqueia_gravacao(matriz, dados, campo, valor):
    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    descoberta = db.get(CandidatoLegadoCaptura, referencia.captura_id)
    if campo == "elegivel":
        rodada = FonteCaptura(
            fonte="siconv_descoberta", iniciado_em=datetime.now(UTC), finalizado_em=datetime.now(UTC), status="ok"
        )
        db.add(rodada)
        db.flush()
        descoberta.fonte_captura_id = rodada.id
        descoberta.motivo_inelegibilidade = "fora_recorte_oficial"
    setattr(descoberta, campo, valor)
    db.commit()
    antes = quantidade(db, FonteCaptura)
    with pytest.raises(ConflictError):
        registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    assert quantidade(db, CandidatoLegadoRecaptura) == 0
    assert quantidade(db, FonteCaptura) == antes


def test_falha_apos_flush_da_prova_reverte_toda_a_transacao(matriz, dados, monkeypatch):
    from app.services import recapturas_legado as service

    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    adicionar = service.repositorio.adicionar

    def falhar(db, registro):
        adicionar(db, registro)
        raise RuntimeError("Falha sintética após flush")

    monkeypatch.setattr(service.repositorio, "adicionar", falhar)
    with pytest.raises(RuntimeError, match="sintética"):
        registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    assert quantidade(db, CandidatoLegadoRecaptura) == quantidade(db, FonteCaptura) == 0
    assert quantidade(db, CandidatoLegadoCaptura) == 1


def test_duas_sessoes_simultaneas_reutilizam_a_mesma_tentativa(matriz, dados):
    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    bind = db.get_bind()
    barreira = Barrier(2)

    def executar():
        with Session(bind) as sessao:
            barreira.wait(timeout=10)
            return registrar_recaptura(db=sessao, referencia=referencia, captura=captura, origem=origem).id

    with ThreadPoolExecutor(max_workers=2) as executor:
        tarefas = [executor.submit(executar) for _ in range(2)]
        ids = [t.result(timeout=20) for t in tarefas]
    assert ids[0] == ids[1]
    assert quantidade(db, FonteCaptura) == quantidade(db, CandidatoLegadoRecaptura) == 1


def test_decisao_rejeitada_preservada_sem_aceitar_nova_prova(matriz, dados):
    from uuid import uuid4

    from app.schemas_legado import DecisaoLegadoCreate
    from app.services.decisoes_legado import registrar_decisao

    db, usuarios, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    registrar_decisao(
        db=db,
        usuario=usuarios["admin"],
        candidato_id=referencia.candidato_id,
        dados=DecisaoLegadoCreate(
            acao="rejeitar",
            chave=uuid4(),
            captura_id=referencia.captura_id,
            versao=0,
            justificativa="Fora da carteira da equipe",
        ),
    )
    with pytest.raises(ConflictError, match="encerrada"):
        registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    assert quantidade(db, FonteCaptura) == quantidade(db, CandidatoLegadoRecaptura) == 0


def test_consulta_posterior_mantem_prova_antiga_em_vez_de_atualizar(matriz, dados):
    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    antiga = registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    origem = origem.model_copy(update={"iniciado_em": datetime.now(UTC)})
    dados["convenio"]["SIT_CONVENIO"] = "Prestação de Contas Concluída"
    nova = registrar_recaptura(
        db=db, referencia=referencia, captura=CapturaLegadoParaPromocao.model_validate(dados), origem=origem
    )
    assert antiga.id != nova.id and antiga.fonte_captura_id != nova.fonte_captura_id
    assert db.get(CandidatoLegadoRecaptura, antiga.id).situacao == "Em execução"
    assert db.get(CandidatoLegadoRecaptura, nova.id).situacao == "Prestação de Contas Concluída"
    assert quantidade(db, CandidatoLegadoRecaptura) == quantidade(db, FonteCaptura) == 2


def test_lock_recarrega_referencia_alterada_por_outra_sessao(matriz, dados):
    db, *_ = matriz
    referencia, captura, origem = preparar(db, dados)
    # Mantém a entidade antiga no identity map desta sessão.
    antigo = db.get(CandidatoLegadoRegistro, referencia.candidato_id)
    assert antigo.ultima_captura_id == referencia.captura_id
    with Session(db.get_bind()) as outra:
        registro = outra.get(CandidatoLegadoRegistro, referencia.candidato_id)
        assert registro is not None
        registro.ultima_captura_id = None
        outra.commit()
    with pytest.raises(ConflictError, match="descoberta mudou"):
        registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    assert quantidade(db, FonteCaptura) == quantidade(db, CandidatoLegadoRecaptura) == 0
