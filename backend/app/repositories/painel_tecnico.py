"""Consultas de leitura do painel individual do técnico (monitoramento interno).

Só lê. Registro ativo = `substituido_por_id IS NULL AND deletado_em IS NULL`. Escopo da região: convênios do escopo
(`fora_escopo_equipamentos` falso). `ufs=None` significa todas as UFs (visão da gestão); `usuario_id=None`, todos os técnicos.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import Select, and_, exists, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AcaoMonitoramento,
    ConclusaoInstrumento,
    Convenio,
    EntregaEquipamento,
    EventoMarco,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    RepasseInstrumento,
    User,
    UserRole,
    UserStatus,
    UsuarioRegiaoMonitoramento,
)
from app.repositories.convenios import instrumento_no_escopo

PERSUS_II = "PERSUS II"
JANELA_RECENTE_DIAS = 15


def ufs_do_usuario(db: Session, usuario_id: int) -> list[str]:
    return list(
        db.execute(
            select(UsuarioRegiaoMonitoramento.uf)
            .where(UsuarioRegiaoMonitoramento.usuario_id == usuario_id)
            .order_by(UsuarioRegiaoMonitoramento.uf)
        ).scalars()
    )


def listar_tecnicos(db: Session) -> list[dict[str, Any]]:
    """Colaboradores ativos com a região e o volume de instrumentos de que são responsáveis."""
    titular = (
        select(func.count())
        .select_from(InstrumentoResponsavel)
        .where(InstrumentoResponsavel.usuario_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    linhas = db.execute(
        select(User.id, User.name, titular)
        .where(User.role == UserRole.colaborador, User.deleted_at.is_(None), User.status == UserStatus.active)
        .order_by(User.name)
    ).all()
    regioes: dict[int, list[str]] = {}
    for uid, uf in db.execute(
        select(UsuarioRegiaoMonitoramento.usuario_id, UsuarioRegiaoMonitoramento.uf).order_by(
            UsuarioRegiaoMonitoramento.uf
        )
    ):
        regioes.setdefault(uid, []).append(uf)
    return [{"id": i, "nome": n, "ufs": regioes.get(i, []), "instrumentos": int(q or 0)} for i, n, q in linhas]


def _ids_instrumentos_da_regiao(ufs: list[str] | None) -> Select[Any]:
    consulta = (
        select(InstrumentoEquipamento.id)
        .join(Convenio, Convenio.numero == InstrumentoEquipamento.nr_convenio)
        .where(Convenio.fora_escopo_equipamentos.is_(False))
    )
    if ufs is not None:
        consulta = consulta.where(Convenio.uf.in_(ufs))
    return consulta


def _ids_instrumentos_do_usuario(usuario_id: int | None) -> Select[Any]:
    consulta = select(InstrumentoEquipamento.id).where(instrumento_no_escopo())
    if usuario_id is not None:
        consulta = consulta.where(
            InstrumentoEquipamento.id.in_(
                select(InstrumentoResponsavel.instrumento_id).where(InstrumentoResponsavel.usuario_id == usuario_id)
            )
        )
    return consulta


def _ativo(modelo: Any) -> Any:
    return and_(modelo.substituido_por_id.is_(None), modelo.deletado_em.is_(None))


def contagens(db: Session, ids: Select[Any]) -> dict[str, int]:
    inst = InstrumentoEquipamento
    com_registro = exists().where(EventoMarco.instrumento_id == inst.id, _ativo(EventoMarco)) | exists().where(
        AcaoMonitoramento.instrumento_id == inst.id, _ativo(AcaoMonitoramento)
    )
    concluido = exists().where(
        ConclusaoInstrumento.instrumento_id == inst.id, ConclusaoInstrumento.deletado_em.is_(None)
    )
    repasse = exists().where(RepasseInstrumento.instrumento_id == inst.id, _ativo(RepasseInstrumento))
    entrega = exists().where(EntregaEquipamento.instrumento_id == inst.id, _ativo(EntregaEquipamento))
    total, com, conc, rep, ent = db.execute(
        select(
            func.count(),
            func.count().filter(com_registro),
            func.count().filter(concluido),
            func.count().filter(repasse),
            func.count().filter(entrega),
        ).where(inst.id.in_(ids))
    ).one()
    return {
        "instrumentos": total,
        "com_registro": com,
        "sem_registro": total - com,
        "concluidos": conc,
        "com_repasse": rep,
        "com_entrega": ent,
    }


def contagens_regiao(db: Session, ufs: list[str] | None) -> dict[str, int]:
    return contagens(db, _ids_instrumentos_da_regiao(ufs))


def contagens_do_usuario(db: Session, usuario_id: int | None) -> dict[str, int]:
    return contagens(db, _ids_instrumentos_do_usuario(usuario_id))


def sem_titular_na_regiao(db: Session, ufs: list[str] | None) -> int:
    sem = ~exists().where(InstrumentoResponsavel.instrumento_id == InstrumentoEquipamento.id)
    return int(
        db.execute(
            select(func.count())
            .select_from(InstrumentoEquipamento)
            .where(InstrumentoEquipamento.id.in_(_ids_instrumentos_da_regiao(ufs)), sem)
        ).scalar_one()
    )


def _faltantes_base(ufs: list[str] | None) -> Select[Any]:
    consulta = select(Convenio).where(
        Convenio.fora_escopo_equipamentos.is_(False),
        Convenio.tipo_contratacao == "Convênio",
        ~exists().where(InstrumentoEquipamento.nr_convenio == Convenio.numero),
    )
    if ufs is not None:
        consulta = consulta.where(Convenio.uf.in_(ufs))
    return consulta


def _em_aberto(c: Convenio) -> bool:
    return not (c.situacao or "").lower().endswith("concluída")


def resumo_carteira(db: Session, ufs: list[str] | None) -> dict[str, Any]:
    base_elegiveis = (
        select(func.count())
        .select_from(Convenio)
        .where(
            Convenio.fora_escopo_equipamentos.is_(False),
            func.coalesce(Convenio.tipo_contratacao, "Convênio") != PERSUS_II,
        )
    )
    if ufs is not None:
        base_elegiveis = base_elegiveis.where(Convenio.uf.in_(ufs))
    elegiveis = int(db.execute(base_elegiveis).scalar_one())
    faltantes = list(db.execute(_faltantes_base(ufs)).scalars())
    abertos = [c for c in faltantes if _em_aberto(c)]
    concluidos = [c for c in faltantes if not _em_aberto(c)]
    monitorados = elegiveis - len(faltantes)

    def soma(itens: list[Convenio]) -> float:
        return float(sum(float(c.valor_global or 0) for c in itens))

    return {
        "elegiveis": elegiveis,
        "monitorados": monitorados,
        "cobertura_pct": round(100 * monitorados / elegiveis, 1) if elegiveis else None,
        "faltam_em_aberto": len(abertos),
        "faltam_concluidos": len(concluidos),
        "valor_faltam_em_aberto": soma(abertos),
        "valor_faltam_concluidos": soma(concluidos),
    }


def carteira_da_regiao(
    db: Session, ufs: list[str] | None, usuario_id: int | None, hoje: date, limite: int = 1000
) -> list[dict[str, Any]]:
    """Um convênio por linha (PERSUS II fora), com o que o técnico precisa para triar: se já está no monitoramento,
    se tem evento ou ação, ações atrasadas e se houve lançamento recente."""
    consulta = (
        select(Convenio, InstrumentoEquipamento.id, InstrumentoEquipamento.cnes)
        .outerjoin(InstrumentoEquipamento, InstrumentoEquipamento.nr_convenio == Convenio.numero)
        .where(
            Convenio.fora_escopo_equipamentos.is_(False),
            func.coalesce(Convenio.tipo_contratacao, "Convênio") != PERSUS_II,
        )
        .order_by(Convenio.valor_global.desc().nulls_last(), Convenio.numero)
        .limit(limite)
    )
    if ufs is not None:
        consulta = consulta.where(Convenio.uf.in_(ufs))
    linhas = db.execute(consulta).all()
    ids = [i for _, i, _ in linhas if i is not None]

    eventos: dict[int, int] = {}
    recentes: set[int] = set()
    acoes: dict[int, tuple[int, int]] = {}  # (total ativas, abertas e atrasadas)
    titulares: dict[int, str] = {}
    if ids:
        for iid, n in db.execute(
            select(EventoMarco.instrumento_id, func.count())
            .where(EventoMarco.instrumento_id.in_(ids), _ativo(EventoMarco))
            .group_by(EventoMarco.instrumento_id)
        ):
            eventos[iid] = n
        autor = EventoMarco.autor_id == usuario_id if usuario_id is not None else EventoMarco.autor_id.is_not(None)
        recentes = set(
            db.execute(
                select(EventoMarco.instrumento_id)
                .where(
                    EventoMarco.instrumento_id.in_(ids),
                    _ativo(EventoMarco),
                    autor,
                    EventoMarco.created_at >= datetime.now(UTC) - timedelta(days=JANELA_RECENTE_DIAS),
                )
                .distinct()
            ).scalars()
        )
        aberta = AcaoMonitoramento.data_conclusao.is_(None)
        for iid, total, atrasadas in db.execute(
            select(
                AcaoMonitoramento.instrumento_id,
                func.count(),
                func.count().filter(aberta, AcaoMonitoramento.data_prevista < hoje),
            )
            .where(AcaoMonitoramento.instrumento_id.in_(ids), _ativo(AcaoMonitoramento))
            .group_by(AcaoMonitoramento.instrumento_id)
        ):
            acoes[iid] = (total, atrasadas)
        for iid, nome in db.execute(
            select(InstrumentoResponsavel.instrumento_id, User.name)
            .join(User, User.id == InstrumentoResponsavel.usuario_id)
            .where(InstrumentoResponsavel.instrumento_id.in_(ids), InstrumentoResponsavel.papel == "titular")
        ):
            titulares[iid] = nome

    resultado = []
    for c, iid, cnes_instrumento in linhas:
        monitorado = iid is not None
        n_eventos = eventos.get(iid, 0) if monitorado else 0
        n_acoes, atrasadas = acoes.get(iid, (0, 0)) if monitorado else (0, 0)
        resultado.append(
            {
                "instrumento_id": iid,
                "numero": c.numero,
                "uf": c.uf,
                "municipio": c.municipio,
                "convenente": c.convenente_nome,
                "cnes": cnes_instrumento or c.cnes,
                "cnpj_convenente": c.convenente_cnpj,
                "tipo_contratacao": c.tipo_contratacao,
                "situacao": c.situacao,
                "valor_global": float(c.valor_global) if c.valor_global is not None else None,
                "em_aberto": _em_aberto(c),
                "monitorado": monitorado,
                "titular": titulares.get(iid) if monitorado else None,
                "eventos": n_eventos,
                "acoes": n_acoes,
                "acoes_atrasadas": atrasadas,
                "lancado_recente": monitorado and iid in recentes,
                "sem_registro": monitorado and n_eventos == 0 and n_acoes == 0,
            }
        )
    return resultado


def atividade(db: Session, usuario_id: int | None, semanas: int = 8) -> dict[str, Any]:
    autor = EventoMarco.autor_id == usuario_id if usuario_id is not None else EventoMarco.autor_id.is_not(None)
    filtros = (_ativo(EventoMarco), autor)
    agora = datetime.now(UTC)
    total, ult15, tocados, ultimo = db.execute(
        select(
            func.count(),
            func.count().filter(EventoMarco.created_at >= agora - timedelta(days=JANELA_RECENTE_DIAS)),
            func.count(func.distinct(EventoMarco.instrumento_id)),
            func.max(EventoMarco.created_at),
        ).where(*filtros)
    ).one()
    semana = func.date_trunc("week", EventoMarco.created_at)
    por_semana = db.execute(
        select(semana, func.count())
        .where(*filtros, EventoMarco.created_at >= agora - timedelta(weeks=semanas))
        .group_by(semana)
        .order_by(semana)
    ).all()
    return {
        "lancamentos_total": total,
        "lancamentos_15d": ult15,
        "instrumentos_tocados": tocados,
        "ultimo_lancamento": ultimo,
        "por_semana": [{"semana": s.date(), "lancamentos": n} for s, n in por_semana],
    }
