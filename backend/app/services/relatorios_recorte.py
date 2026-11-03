"""Consultas do recorte do relatório de instrumentos e repasse.

Parte do pacote de relatórios; a fachada pública é `app.services.relatorios`.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import (
    Convenio,
    PropostaCandidata,
)
from app.pipeline.texto import normalizar_texto
from app.repositories import convenios as convenios_repo
from app.repositories import equipamento_marcadores as equipamento_marcadores_repo
from app.repositories import propostas_candidatas_relatorio as propostas_repo
from app.services.monitoramento_instrumentos import InstrumentoComFase, listar_monitorados_para_relatorio
from app.services.relatorios_filtro import _TIPO_PROPOSTA, FiltroRelatorio

# ---------------------------------------------------------------------
# Instrumentos e repasse (convênios + propostas candidatas + monitoramento).
# ---------------------------------------------------------------------


def _convenios(db: Session, filtro: FiltroRelatorio) -> list[Convenio]:
    if filtro.situacao_origem == "proposta":
        return []
    convenios = _convenios_do_recorte(db, filtro)
    if filtro.situacao_origem == "monitoramento":
        numeros = {i.instrumento.nr_convenio for i in _instrumentos(db, filtro)}
        return [c for c in convenios if c.numero in numeros]
    return convenios


def _convenios_do_recorte(db: Session, filtro: FiltroRelatorio) -> list[Convenio]:
    return convenios_repo.listar_convenios_filtrados(
        db,
        ufs=filtro.ufs(),
        municipio=filtro.municipio_do_escopo(),
        cnes=filtro.cnes_do_escopo(),
        ano_inicio=filtro.ano_inicio,
        ano_fim=filtro.ano_fim,
        situacao=filtro.situacao if filtro.situacao_origem in (None, "instrumento") else None,
        programa=filtro.programa,
        tipo_contratacao=filtro.tipo_contratacao,
        equipamento=filtro.equipamento,
        busca=filtro.busca,
    )


def _propostas(db: Session, filtro: FiltroRelatorio) -> list[PropostaCandidata]:
    if filtro.situacao_origem in ("instrumento", "monitoramento"):
        return []
    propostas = _propostas_do_recorte(db, filtro)
    if filtro.situacao_origem == "proposta" and filtro.situacao:
        alvo = normalizar_texto(filtro.situacao)
        propostas = [p for p in propostas if normalizar_texto(p.situacao_proposta) == alvo]
    # Os demais filtros valem para todas as seções; proposta é sempre "Parceria TransfereGov".
    if filtro.tipo_contratacao and normalizar_texto(filtro.tipo_contratacao) != normalizar_texto(_TIPO_PROPOSTA):
        return []
    if filtro.programa:
        alvo = normalizar_texto(filtro.programa)
        propostas = [p for p in propostas if normalizar_texto(p.nm_programa) == alvo]
    if filtro.busca:
        alvo = normalizar_texto(filtro.busca)
        propostas = [
            p
            for p in propostas
            if alvo in normalizar_texto(f"{p.cd_parceria or ''} {p.id_proposta} {p.nm_proponente} {p.municipio or ''}")
        ]
    if filtro.equipamento:
        ids = equipamento_marcadores_repo.ids_com_equipamento(
            db, "proposta_candidata", {p.id for p in propostas}, filtro.equipamento
        )
        propostas = [p for p in propostas if p.id in ids]
    return propostas


def _propostas_do_recorte(db: Session, filtro: FiltroRelatorio) -> list[PropostaCandidata]:
    # Geografia e período aqui; situação, programa, tipo, equipamento e busca em `_propostas`.
    return propostas_repo.listar_propostas_filtradas(
        db,
        ufs=filtro.ufs(),
        municipio=filtro.municipio_do_escopo(),
        cnes=filtro.cnes_do_escopo(),
        ano_inicio=filtro.ano_inicio,
        ano_fim=filtro.ano_fim,
    )


def _instrumentos(db: Session, filtro: FiltroRelatorio) -> list[InstrumentoComFase]:
    if filtro.situacao_origem in ("instrumento", "proposta"):
        return []
    instrumentos = _instrumentos_do_recorte(db, filtro)
    if filtro.situacao_origem == "monitoramento" and filtro.situacao:
        alvo = normalizar_texto(filtro.situacao)
        instrumentos = [i for i in instrumentos if normalizar_texto(i.fase_atual) == alvo]
    if filtro.programa:
        alvo = normalizar_texto(filtro.programa)
        instrumentos = [i for i in instrumentos if normalizar_texto(i.instrumento.programa) == alvo]
    if filtro.busca:
        alvo = normalizar_texto(filtro.busca)
        instrumentos = [
            i
            for i in instrumentos
            if alvo
            in normalizar_texto(
                f"{i.instrumento.nr_convenio} {i.instrumento.nome_convenente or ''} {i.instrumento.municipio or ''}"
            )
        ]
    if filtro.equipamento:
        ids = equipamento_marcadores_repo.ids_com_equipamento(
            db, "instrumento_equipamento", {i.instrumento.id for i in instrumentos}, filtro.equipamento
        )
        instrumentos = [i for i in instrumentos if i.instrumento.id in ids]
    return instrumentos


def _instrumentos_do_recorte(db: Session, filtro: FiltroRelatorio) -> list[InstrumentoComFase]:
    # Geografia, período e tipo aqui; situação, programa, equipamento e busca em `_instrumentos`.
    return listar_monitorados_para_relatorio(
        db=db,
        ufs=filtro.ufs(),
        municipio=filtro.municipio_do_escopo(),
        cnes=filtro.cnes_do_escopo(),
        ano_inicio=filtro.ano_inicio,
        ano_fim=filtro.ano_fim,
        tipo_contratacao=filtro.tipo_contratacao,
    )
