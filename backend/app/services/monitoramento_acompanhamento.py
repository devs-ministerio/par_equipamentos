"""Resumo de acompanhamento (inauguração e entrega) mostrado em leitura nos Dados oficiais (D17).

Cálculo sobre os eventos ativos já registrados; nenhuma data é inferida nem corrigida. A sequência cronológica
incompatível vira apenas uma indicação de conferência, sem reescrever o histórico.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy.orm import Session

from app.repositories import monitoramento as monitoramento_repo
from app.schemas_monitoramento_api import AcompanhamentoRead

MARCO_INAUGURACAO = "cronograma_previsao_inauguracao"
MARCO_ENTREGA = "cronograma_entrega"


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def conferencia_cronologica(inauguracao_real: date | None, entrega: date | None) -> str | None:
    if inauguracao_real and entrega and entrega > inauguracao_real:
        return (
            f"Entrega registrada em {_fmt(entrega)}, depois da inauguração em {_fmt(inauguracao_real)}; "
            "conferir a carga."
        )
    return None


def acompanhamento_dos_instrumentos(db: Session, instrumento_ids: Sequence[int]) -> dict[int, AcompanhamentoRead]:
    if not instrumento_ids:
        return {}
    marcos = {
        m.id: m.codigo
        for m in monitoramento_repo.listar_marcos_catalogo(db, limit=200)
        if m.codigo in (MARCO_INAUGURACAO, MARCO_ENTREGA)
    }
    eventos = monitoramento_repo.listar_eventos_por_instrumentos(db, list(instrumento_ids), marco_ids=list(marcos))
    resultado: dict[int, AcompanhamentoRead] = {}
    for instrumento_id in instrumento_ids:
        inauguracao = None
        entrega: date | None = None
        for evento in eventos.get(instrumento_id, []):  # do lançamento mais recente ao mais antigo
            codigo = marcos.get(evento.marco_id)
            if codigo == MARCO_INAUGURACAO and inauguracao is None:
                inauguracao = evento
            elif codigo == MARCO_ENTREGA and entrega is None and evento.data_ocorrencia:
                entrega = evento.data_ocorrencia
        real = inauguracao.data_ocorrencia if inauguracao else None
        previsao = inauguracao.data_prevista if inauguracao else None
        resultado[instrumento_id] = AcompanhamentoRead(
            inauguracao_data=real or previsao,
            inauguracao_realizada=real is not None,
            entrega_data=entrega,
            conferencia=conferencia_cronologica(real, entrega),
        )
    return resultado
