"""Documentos do instrumento: regras do Service, histórico append-only e migração dos marcos antigos."""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError as PydanticError
from sqlalchemy import select

from app.db.models import DocumentoInstrumento, EventoMarco, MarcoCatalogo
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError
from app.schemas_documentos import DocumentoCreate, DocumentoExclusao
from app.services import documentos_instrumento as svc
from app.services.migracao_documentos import migrar
from tests.test_entregas_equipamento_db import Cenario, db  # noqa: F401

pytestmark = pytest.mark.db


def _nf(**kw) -> DocumentoCreate:
    return DocumentoCreate(tipo=kw.pop("tipo", "nota_fiscal"), data_documento=date(2026, 11, 1), **kw)


def _lista(sessao, c):
    return svc.listar_documentos(nr_convenio=c.inst.nr_convenio, db=sessao, usuario=c.titular)


def test_registra_varios_do_mesmo_tipo_e_nao_muda_a_fase(db):  # noqa: F811
    c = Cenario(db)
    svc.registrar_documento(nr_convenio=c.inst.nr_convenio, dados=_nf(numero="123"), db=db, usuario=c.titular)
    svc.registrar_documento(nr_convenio=c.inst.nr_convenio, dados=_nf(numero="124"), db=db, usuario=c.titular)
    leitura = _lista(db, c)
    assert sorted(d.numero or "" for d in leitura.documentos) == ["123", "124"]
    assert leitura.pode_editar is True
    assert db.scalars(select(EventoMarco).where(EventoMarco.instrumento_id == c.inst.id)).first() is None


def test_status_e_validade_so_valem_onde_cabem():
    with pytest.raises(PydanticError):
        _nf(status="Deferido")
    with pytest.raises(PydanticError):
        _nf(tipo="cnen_scra", data_validade=date(2027, 1, 1))
    DocumentoCreate(
        tipo="cnen_licenca", data_documento=date(2026, 11, 1), status="Deferido", data_validade=date(2027, 1, 1)
    )


def test_corrigir_cria_linha_nova_e_mantem_a_antiga(db):  # noqa: F811
    c = Cenario(db)
    antigo = svc.registrar_documento(nr_convenio=c.inst.nr_convenio, dados=_nf(numero="1"), db=db, usuario=c.titular)
    novo = svc.corrigir_documento(documento_id=antigo.id, dados=_nf(numero="2"), db=db, usuario=c.titular)
    assert [d.numero for d in _lista(db, c).documentos] == ["2"]
    assert db.get(DocumentoInstrumento, antigo.id).substituido_por_id == novo.id
    with pytest.raises(ConflictError):
        svc.corrigir_documento(documento_id=antigo.id, dados=_nf(numero="3"), db=db, usuario=c.titular)


def test_excluir_e_soft_delete_com_motivo(db):  # noqa: F811
    c = Cenario(db)
    doc = svc.registrar_documento(nr_convenio=c.inst.nr_convenio, dados=_nf(), db=db, usuario=c.titular)
    svc.excluir_documento(
        documento_id=doc.id, dados=DocumentoExclusao(motivo="Lançado no instrumento errado"), db=db, usuario=c.titular
    )
    assert _lista(db, c).documentos == []
    assert db.get(DocumentoInstrumento, doc.id).motivo_exclusao == "Lançado no instrumento errado"
    with pytest.raises(ConflictError):
        svc.excluir_documento(
            documento_id=doc.id,
            dados=DocumentoExclusao(motivo="Lançado no instrumento errado"),
            db=db,
            usuario=c.titular,
        )


def test_permissao_por_titularidade_e_papel(db):  # noqa: F811
    c = Cenario(db)
    for usuario in (c.outro, c.leitor):
        with pytest.raises(AuthorizationError):
            svc.registrar_documento(nr_convenio=c.inst.nr_convenio, dados=_nf(), db=db, usuario=usuario)
    svc.registrar_documento(nr_convenio=c.inst.nr_convenio, dados=_nf(), db=db, usuario=c.gestor)
    assert _lista(db, c).documentos  # leitura é livre para qualquer autenticado


def test_instrumento_inexistente(db):  # noqa: F811
    c = Cenario(db)
    with pytest.raises(NotFoundError):
        svc.listar_documentos(nr_convenio="NAO-EXISTE", db=db, usuario=c.titular)


def _evento(sessao, c, codigo, **kw) -> EventoMarco:
    marco = sessao.scalar(select(MarcoCatalogo).where(MarcoCatalogo.codigo == codigo))
    assert marco is not None, f"marco {codigo} ausente do catálogo de teste"
    evento = EventoMarco(instrumento_id=c.inst.id, marco_id=marco.id, **kw)
    sessao.add(evento)
    sessao.flush()
    return evento


def test_migracao_converte_so_o_que_tem_data_realizada_e_e_idempotente(db):  # noqa: F811
    c = Cenario(db)
    trp = _evento(db, c, "cronograma_trp", data_ocorrencia=date(2026, 9, 1), observacao="Recebido")
    _evento(db, c, "cronograma_trd", data_prevista=date(2026, 12, 1))
    lic = _evento(
        db,
        c,
        "regulatorio_licenca_operacao",
        data_ocorrencia=date(2026, 10, 5),
        status_regulatorio="Deferido (da fonte braqui)",
        numero_documento="LO-9",
        data_validade=date(2028, 10, 5),
    )
    scra = _evento(
        db, c, "regulatorio_descomissionamento", data_ocorrencia=date(2026, 8, 1), status_regulatorio="Estranho"
    )
    migrar(db, aplicar=True)
    migrar(db, aplicar=True)
    docs = {
        d.origem_evento_id: d
        for d in db.scalars(select(DocumentoInstrumento).where(DocumentoInstrumento.instrumento_id == c.inst.id))
    }
    assert len(docs) == 3
    assert docs[trp.id].tipo == "trp" and docs[trp.id].observacao == "Recebido"
    assert (
        docs[lic.id].status == "Deferido"
        and docs[lic.id].numero == "LO-9"
        and docs[lic.id].data_validade == date(2028, 10, 5)
    )
    assert docs[scra.id].tipo == "cnen_scra" and docs[scra.id].status is None
    assert "descomissionamento" in (docs[scra.id].observacao or "")
    assert db.get(EventoMarco, trp.id).deletado_em is None  # evento antigo intacto


def test_migracao_em_simulacao_nao_grava(db):  # noqa: F811
    c = Cenario(db)
    _evento(db, c, "cronograma_trp", data_ocorrencia=date(2026, 9, 1))
    resultado = migrar(db, aplicar=False)
    assert resultado["trp: migrado"] >= 1
    assert (
        db.scalars(select(DocumentoInstrumento).where(DocumentoInstrumento.instrumento_id == c.inst.id)).first() is None
    )
