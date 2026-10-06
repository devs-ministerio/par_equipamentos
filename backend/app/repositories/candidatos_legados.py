"""SQL do Radar legado; commit e decisões ficam no Service."""

from collections import defaultdict

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import Convenio, EquipamentoCatalogo, InstrumentoEquipamento
from app.db.models_legado import (
    CandidatoLegadoCaptura,
    CandidatoLegadoDecisao,
    CandidatoLegadoEvidencia,
    CandidatoLegadoRegistro,
)
from app.schemas_legado import CandidatoLegadoRead, EvidenciaLegadoRead


def bloquear_lote(db: Session) -> None:
    db.execute(select(func.pg_advisory_xact_lock(func.hashtext("sigeo:radar-legado"))))


def obter_registros(db: Session, numeros: set[str]) -> dict[str, CandidatoLegadoRegistro]:
    return {
        r.numero: r
        for r in db.scalars(select(CandidatoLegadoRegistro).where(CandidatoLegadoRegistro.numero.in_(numeros)))
    }


def obter_por_id(db: Session, candidato_id: int) -> CandidatoLegadoRegistro | None:
    return db.get(CandidatoLegadoRegistro, candidato_id)


def obter_capturas(db: Session, ids: set[int]) -> dict[int, CandidatoLegadoCaptura]:
    return {r.id: r for r in db.scalars(select(CandidatoLegadoCaptura).where(CandidatoLegadoCaptura.id.in_(ids)))}


def adicionar(
    db: Session, registro: CandidatoLegadoRegistro | CandidatoLegadoCaptura | CandidatoLegadoEvidencia
) -> None:
    db.add(registro)
    db.flush()


def catalogo_por_codigos(db: Session, codigos: set[str]) -> dict[str, int]:
    return {
        codigo: identificador
        for codigo, identificador in db.execute(
            select(EquipamentoCatalogo.codigo, EquipamentoCatalogo.id).where(EquipamentoCatalogo.codigo.in_(codigos))
        )
    }


def evidencias_por_captura(db: Session, ids: set[int]) -> dict[int, list[EvidenciaLegadoRead]]:
    resultado: dict[int, list[EvidenciaLegadoRead]] = defaultdict(list)
    if ids:
        for evidencia, codigo, nome in db.execute(
            select(CandidatoLegadoEvidencia, EquipamentoCatalogo.codigo, EquipamentoCatalogo.nome)
            .join(EquipamentoCatalogo, EquipamentoCatalogo.id == CandidatoLegadoEvidencia.equipamento_catalogo_id)
            .where(CandidatoLegadoEvidencia.captura_id.in_(ids))
            .order_by(CandidatoLegadoEvidencia.id_item, EquipamentoCatalogo.codigo)
        ):
            resultado[evidencia.captura_id].append(
                EvidenciaLegadoRead.model_validate(
                    {
                        "id_item": evidencia.id_item,
                        "codigo": codigo,
                        "nome": nome,
                        "descricao": evidencia.descricao,
                        "relacao": evidencia.relacao,
                    }
                )
            )
    return resultado


def _consulta_candidatos():
    candidato, captura = CandidatoLegadoRegistro, CandidatoLegadoCaptura
    decisao = CandidatoLegadoDecisao
    ultima_id = (
        select(func.max(decisao.id)).where(decisao.candidato_id == candidato.id).correlate(candidato).scalar_subquery()
    )
    consulta = (
        select(candidato, captura, decisao)
        .join(captura, captura.id == candidato.ultima_captura_id)
        .outerjoin(decisao, decisao.id == ultima_id)
    )
    conhecido = (
        select(Convenio.id)
        .where(
            Convenio.numero == candidato.numero,
            Convenio.tipo_contratacao.in_(["Convênio", "Convenio"]) | Convenio.tipo_contratacao.is_(None),
        )
        .exists()
    )
    monitorado = (
        select(InstrumentoEquipamento.id)
        .where(
            InstrumentoEquipamento.nr_convenio == candidato.numero,
            InstrumentoEquipamento.tipo_contratacao.in_(["Convênio", "Convenio"]),
        )
        .exists()
    )
    # Decisões encerradas continuam consultáveis, mesmo após entrada na carteira.
    return consulta.where(or_(decisao.situacao.in_(["aprovado", "rejeitado"]), ~conhecido & ~monitorado))


def contar_novos(db: Session) -> int:
    consulta = _consulta_candidatos().where(
        CandidatoLegadoCaptura.origem == "siconv_oficial", CandidatoLegadoDecisao.id.is_(None)
    )
    return db.scalar(select(func.count()).select_from(consulta.subquery())) or 0


def listar_pagina(
    db: Session,
    *,
    pagina: int,
    tamanho: int,
    busca: str | None,
    confirmacao: str | None,
    situacao: str | None = None,
    somente_oficiais: bool = False,
) -> tuple[int, list[CandidatoLegadoRead]]:
    candidato, captura, decisao = CandidatoLegadoRegistro, CandidatoLegadoCaptura, CandidatoLegadoDecisao
    consulta = _consulta_candidatos()
    if somente_oficiais:
        consulta = consulta.where(captura.origem == "siconv_oficial")
    if situacao:
        consulta = consulta.where(func.coalesce(decisao.situacao, "novo") == situacao)
    if confirmacao:
        consulta = consulta.where(captura.confirmacao_portal == confirmacao)
    if busca:
        alvo = "%" + busca.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        consulta = consulta.where(
            or_(candidato.numero.ilike(alvo, escape="\\"), candidato.id_proposta.ilike(alvo, escape="\\"))
        )
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = db.execute(
        consulta.order_by(candidato.verificado_em.desc(), candidato.id.desc())
        .limit(tamanho)
        .offset((pagina - 1) * tamanho)
    ).all()
    evidencias = evidencias_por_captura(db, {captura.id for _, captura, _ in registros})
    itens = [
        CandidatoLegadoRead.model_validate(
            {
                "id": candidato.id,
                "numero": candidato.numero,
                "id_proposta": candidato.id_proposta,
                "confirmacao_portal": captura.confirmacao_portal,
                "data_publicacao": captura.data_publicacao,
                "origem": captura.origem,
                "descoberto_em": candidato.descoberto_em,
                "verificado_em": candidato.verificado_em,
                "evidencias": evidencias.get(captura.id, []),
                "captura_id": captura.id,
                "situacao": decisao.situacao if decisao else "novo",
                "versao": decisao.id if decisao else 0,
            }
        )
        for candidato, captura, decisao in registros
    ]
    return total, itens
