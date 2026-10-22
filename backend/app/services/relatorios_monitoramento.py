"""Snapshot por geração: histórico limitado aos instrumentos do recorte."""

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db.models import AcaoMonitoramento, EventoMarco, MarcoCatalogo
from app.repositories import monitoramento as repo


@dataclass(frozen=True)
class DadosMonitoramentoRelatorio:
    marcos: dict[int, MarcoCatalogo]
    eventos_por_instrumento: dict[int, list[EventoMarco]]
    acoes_por_instrumento: dict[int, list[AcaoMonitoramento]]
    nomes_responsaveis: dict[int, str]


def carregar_monitoramento_relatorio(
    *, db: Session, instrumento_ids: Sequence[int], com_acoes: bool = True
) -> DadosMonitoramentoRelatorio:
    if not instrumento_ids:
        return DadosMonitoramentoRelatorio({}, {}, {}, {})
    marcos = {m.id: m for m in repo.listar_marcos_catalogo(db, limit=200)}
    eventos = repo.listar_eventos_por_instrumentos(db, instrumento_ids)
    acoes = repo.listar_acoes_por_instrumentos(db, instrumento_ids) if com_acoes else {}
    nomes = repo.resolver_nomes_usuarios(db, (a.responsavel_id for lote in acoes.values() for a in lote))
    return DadosMonitoramentoRelatorio(marcos, eventos, acoes, nomes)
