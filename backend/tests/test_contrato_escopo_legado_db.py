"""Contrato reconstruído contra constraints reais em schema sintético isolado."""

from datetime import date

import pytest
from psycopg import Error as DatabaseDriverError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.catalogo_componentes import COMPONENTES_ALVO
from app.db.models import EquipamentoCatalogo
from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoEvidencia, CandidatoLegadoRegistro
from app.schemas_escopo_descoberta import ComponenteDescoberto
from app.schemas_legado import ReferenciaDescoberta
from app.services.candidatos_legados import listar_candidatos, registrar_descoberta
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado
from tests.test_notificacoes_destinatarios_db import matriz as matriz


@pytest.mark.parametrize(
    "campos",
    [
        {"criterio_escopo": "qualquer"},
        {"criterio_escopo": "prioritarios_ms_v1"},
        {"orgao_superior": "36000"},
        {"criterio_escopo": "prioritarios_ms_v1", "orgao_superior": "51000"},
        {"criterio_escopo": "prioritarios_ms_celebrados_v2", "orgao_superior": "36000"},
        {
            "criterio_escopo": "prioritarios_ms_celebrados_v2",
            "orgao_superior": "36000",
            "data_assinatura_siconv": "2026-10-01",
        },
    ],
)
def test_contrato_rejeita_escopo_incompleto_ou_incompativel(campos):
    with pytest.raises(ValidationError):
        CandidatoLegado.model_validate({"numero": "999001", "id_proposta": "111001", "evidencias": [], **campos})


@pytest.mark.parametrize(
    "campo,valor,constraint",
    [
        ("criterio_escopo", "qualquer", "ck_legado_criterio_escopo"),
        ("orgao_superior", None, "ck_legado_orgao_escopo"),
        ("orgao_superior", "51000", "ck_legado_orgao_escopo"),
        ("data_assinatura_siconv", None, "ck_legado_celebracao_siconv"),
        ("data_publicacao_siconv", None, "ck_legado_celebracao_siconv"),
        ("elegivel", False, "ck_legado_inelegibilidade_rodada"),
        ("motivo_inelegibilidade", "fora_recorte_oficial", "ck_legado_inelegibilidade_rodada"),
        ("fonte_captura_id", 999999, "fk_legado_captura_fonte"),
    ],
)
def test_banco_rejeita_violacao_sem_depender_do_pydantic(matriz, campo, valor, constraint):
    db, *_ = matriz
    candidato = CandidatoLegadoRegistro(numero="999001", id_proposta="111001")
    db.add(candidato)
    db.flush()
    captura = CandidatoLegadoCaptura(
        candidato_id=candidato.id,
        confirmacao_portal="nao_consultado",
        origem="siconv_oficial",
        referencia_snapshot="a" * 64,
        hash_conteudo="b" * 64,
        criterio_escopo="prioritarios_ms_celebrados_v2",
        orgao_superior="36000",
        data_assinatura_siconv=date(2026, 10, 1),
        data_publicacao_siconv=date(2026, 10, 2),
        elegivel=True,
    )
    setattr(captura, campo, valor)
    with pytest.raises(IntegrityError) as erro, db.begin_nested():
        db.add(captura)
        db.flush()
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == constraint


def test_service_preserva_escopo_replay_e_nao_herda_evidencia_de_outro_criterio(matriz):
    db, *_ = matriz
    db.add(EquipamentoCatalogo(codigo="mamografo", nome="Mamógrafo", prioritario=True))
    db.commit()
    referencia = ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="a" * 64)
    evidencia = EvidenciaLegado(
        id_item="1", codigo_equipamento="mamografo", descricao="Aquisição de mamógrafo", relacao="aquisicao"
    )
    antigo = CandidatoLegado(
        numero="999001",
        id_proposta="111001",
        evidencias=(evidencia,),
        confirmacao_portal="confirmado",
        data_publicacao=date(2026, 10, 1),
    )
    assert registrar_descoberta(db=db, candidatos=[antigo], referencia=referencia) == 1
    atual = CandidatoLegado(
        numero="999001",
        id_proposta="111001",
        evidencias=(evidencia.model_copy(update={"id_item": "2"}),),
        criterio_escopo="prioritarios_ms_celebrados_v2",
        orgao_superior="36000",
        data_assinatura_siconv=date(2026, 10, 1),
        data_publicacao_siconv=date(2026, 10, 2),
    )
    assert registrar_descoberta(db=db, candidatos=[atual], referencia=referencia) == 1
    assert registrar_descoberta(db=db, candidatos=[atual], referencia=referencia) == 0
    registro = db.scalar(select(CandidatoLegadoRegistro).where(CandidatoLegadoRegistro.numero == "999001"))
    captura = db.get(CandidatoLegadoCaptura, registro.ultima_captura_id)
    assert captura.criterio_escopo == atual.criterio_escopo
    assert captura.orgao_superior == "36000"
    assert captura.data_assinatura_siconv == atual.data_assinatura_siconv
    assert captura.data_publicacao_siconv == atual.data_publicacao_siconv
    assert captura.confirmacao_portal == "nao_consultado" and captura.data_publicacao is None
    assert list(
        db.scalars(select(CandidatoLegadoEvidencia.id_item).where(CandidatoLegadoEvidencia.captura_id == captura.id))
    ) == ["2"]
    assert len(list(db.scalars(select(CandidatoLegadoCaptura)))) == 2


def test_componente_persistido_sem_inventar_equipamento_e_portal_ausente_sai_da_fila(matriz):
    db, *_ = matriz
    componente = ComponenteDescoberto(
        id_programa="10", nome_programa=COMPONENTES_ALVO[0], componente=COMPONENTES_ALVO[0]
    )
    candidato = CandidatoLegado(
        numero="999002",
        id_proposta="111002",
        evidencias=(),
        componentes=(componente,),
        criterio_escopo="prioritarios_ms_celebrados_v2",
        orgao_superior="36000",
        data_assinatura_siconv=date(2026, 10, 1),
        data_publicacao_siconv=date(2026, 10, 2),
        confirmacao_portal="confirmado",
        data_publicacao=date(2026, 10, 2),
    )
    referencia = ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="c" * 64)
    assert registrar_descoberta(db=db, candidatos=[candidato], referencia=referencia) == 1
    assert registrar_descoberta(db=db, candidatos=[candidato], referencia=referencia) == 0
    resultado = listar_candidatos(db=db, busca="999002", pagina=1, tamanho=10, confirmacao=None)
    assert resultado.total == 1 and resultado.novos == 1
    assert resultado.itens[0].componentes == [componente]
    assert resultado.itens[0].evidencias == []
    ausente = candidato.model_copy(update={"confirmacao_portal": "nao_encontrado", "data_publicacao": None})
    assert registrar_descoberta(db=db, candidatos=[ausente], referencia=referencia) == 1
    resultado = listar_candidatos(db=db, busca="999002", pagina=1, tamanho=10, confirmacao=None)
    assert resultado.total == 0 and resultado.novos == 0
    assert len(list(db.scalars(select(CandidatoLegadoCaptura)))) == 2


def test_captura_oficial_substitui_itens_nao_acumula_evidencia_antiga(matriz):
    db, *_ = matriz
    db.add(EquipamentoCatalogo(codigo="mamografo", nome="Mamógrafo", prioritario=True))
    db.commit()
    evidencia = EvidenciaLegado(
        id_item="1", codigo_equipamento="mamografo", descricao="Aquisição de mamógrafo", relacao="aquisicao"
    )
    candidato = CandidatoLegado(
        numero="999003",
        id_proposta="111003",
        evidencias=(evidencia,),
        criterio_escopo="prioritarios_ms_v1",
        orgao_superior="36000",
        confirmacao_portal="confirmado",
        data_publicacao=date(2026, 10, 2),
    )
    referencia = ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="c" * 64)
    assert registrar_descoberta(db=db, candidatos=[candidato], referencia=referencia) == 1
    atualizado = candidato.model_copy(update={"evidencias": (evidencia.model_copy(update={"id_item": "2"}),)})
    assert registrar_descoberta(db=db, candidatos=[atualizado], referencia=referencia) == 1
    assert registrar_descoberta(db=db, candidatos=[atualizado], referencia=referencia) == 0
    resultado = listar_candidatos(db=db, busca="999003", pagina=1, tamanho=10, confirmacao=None)
    assert [e.id_item for e in resultado.itens[0].evidencias] == ["2"]
    assert len(list(db.scalars(select(CandidatoLegadoEvidencia)))) == 2
