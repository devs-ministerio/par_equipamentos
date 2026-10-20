"""Constraints sobreviventes e transação real, apenas em schema sintético."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.db.models import FonteCaptura
from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoRecaptura, CandidatoLegadoRegistro
from app.repositories import recapturas_legado as repositorio
from tests.test_notificacoes_destinatarios_db import matriz as matriz


def preparar(db):
    candidato = CandidatoLegadoRegistro(numero="999001", id_proposta="111001")
    outro = CandidatoLegadoRegistro(numero="999002", id_proposta="111002")
    db.add_all([candidato, outro])
    db.flush()
    captura = CandidatoLegadoCaptura(
        candidato_id=candidato.id,
        confirmacao_portal="nao_consultado",
        origem="siconv_oficial",
        referencia_snapshot="a" * 64,
        hash_conteudo="b" * 64,
    )
    agora = datetime.now(UTC)
    fonte = FonteCaptura(
        fonte="siconv_recaptura",
        iniciado_em=agora,
        finalizado_em=agora,
        status="ok",
        itens_verificados=1,
    )
    db.add_all([captura, fonte])
    db.flush()
    return candidato, outro, captura, fonte


def prova(candidato, captura, fonte):
    return CandidatoLegadoRecaptura(
        candidato_id=candidato.id,
        captura_id=captura.id,
        fonte_captura_id=fonte.id,
        hash_conteudo="c" * 64,
        situacao="Prestação de Contas Concluída",
        valor_global=Decimal("1000.50"),
        payload_oficial={"convenio": {"NR_CONVENIO": candidato.numero, "VL_GLOBAL_CONV": "1000,50"}},
    )


def test_persiste_sem_arredondar_ou_normalizar_situacao_oficial(matriz):
    db, *_ = matriz
    candidato, outro, captura, fonte = preparar(db)
    registro = prova(candidato, captura, fonte)
    registro.valor_global = Decimal("1000.1234567890123456789")
    repositorio.adicionar(db, registro)
    db.commit()
    db.expire_all()
    salvo = repositorio.obter_por_rodada(db, candidato.id, fonte.id)
    assert salvo is not None
    assert salvo.valor_global == Decimal("1000.1234567890123456789")
    assert salvo.situacao == "Prestação de Contas Concluída"
    assert salvo.payload_oficial == registro.payload_oficial
    identidade = repositorio.obter_por_identidade(db, registro.id, captura.id, candidato.id)
    assert identidade is not None
    assert identidade.id == registro.id
    assert repositorio.obter_por_identidade(db, registro.id, captura.id, outro.id) is None
    assert repositorio.obter_por_rodada(db, outro.id, fonte.id) is None


@pytest.mark.parametrize(
    "campo,valor,constraint",
    [
        ("hash_conteudo", "invalido", "ck_legado_recaptura_hash"),
        ("situacao", "   ", "ck_legado_recaptura_situacao"),
        ("valor_global", Decimal("-1"), "ck_legado_recaptura_valor"),
        ("fonte_captura_id", 999999, "candidato_legado_recaptura_fonte_captura_id_fkey"),
        ("captura_id", 999999, "fk_legado_recaptura_captura_candidato"),
    ],
)
def test_constraints_rejeitam_prova_invalida_sem_confiar_no_service(matriz, campo, valor, constraint):
    db, *_ = matriz
    candidato, _, captura, fonte = preparar(db)
    registro = prova(candidato, captura, fonte)
    setattr(registro, campo, valor)
    with pytest.raises(IntegrityError) as erro, db.begin_nested():
        repositorio.adicionar(db, registro)
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == constraint
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoRecaptura)) == 0


def test_captura_de_outro_candidato_nao_pode_ser_reutilizada(matriz):
    db, *_ = matriz
    _, outro, captura, fonte = preparar(db)
    with pytest.raises(IntegrityError) as erro, db.begin_nested():
        repositorio.adicionar(db, prova(outro, captura, fonte))
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == "fk_legado_recaptura_captura_candidato"


def test_rodada_nao_pode_ter_duas_provas_para_o_mesmo_candidato(matriz):
    db, *_ = matriz
    candidato, _, captura, fonte = preparar(db)
    repositorio.adicionar(db, prova(candidato, captura, fonte))
    with pytest.raises(IntegrityError) as erro, db.begin_nested():
        repositorio.adicionar(db, prova(candidato, captura, fonte))
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == "uq_legado_recaptura_rodada"
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoRecaptura)) == 1


def test_repository_nao_comita_rodada_ou_prova_e_rollback_reverte_ambas(matriz):
    db, *_ = matriz
    candidato, _, captura, fonte = preparar(db)
    fonte_id = fonte.id
    repositorio.adicionar(db, prova(candidato, captura, fonte))
    db.rollback()
    assert db.get(FonteCaptura, fonte_id) is None
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoRecaptura)) == 0
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoCaptura)) == 0
