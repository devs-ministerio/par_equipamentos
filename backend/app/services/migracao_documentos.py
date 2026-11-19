"""Migração dos marcos antigos (OS, TRP, TRD, SCRA e licença da ANSN) para `documento_instrumento`.

Só vira documento o evento ativo com data de ocorrência: previsão sem data realizada é descartada (não há
documento ainda). O evento antigo nunca é alterado. Idempotente por `origem_evento_id`.
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DocumentoInstrumento, EventoMarco, MarcoCatalogo

TIPO_POR_MARCO = {
    "cronograma_ordem_servico": "ordem_servico",
    "cronograma_trp": "trp",
    "cronograma_trd": "trd",
    "regulatorio_licenca_operacao": "cnen_licenca",
    "regulatorio_modificacao_casamata": "cnen_scra",
    "regulatorio_descomissionamento": "cnen_scra",
}
_OBSERVACAO_FIXA = {
    "regulatorio_modificacao_casamata": "SCRA de modificação/casamata",
    "regulatorio_descomissionamento": "SCRA de descomissionamento (equipamento antigo)",
}
_STATUS_CNEN = ("Em análise", "Em diligência", "Deferido", "Indeferido")


def _status_cnen(valor: str | None) -> str | None:
    """Normaliza o vocabulário da ANSN ("Deferido (da fonte braqui)" vira "Deferido"); o que não bate fica nulo."""
    for status in _STATUS_CNEN:
        if (valor or "").strip().lower().startswith(status.lower()):
            return status
    return None


def documento_a_partir_do_evento(evento: EventoMarco, codigo_marco: str) -> DocumentoInstrumento | None:
    tipo = TIPO_POR_MARCO.get(codigo_marco)
    if tipo is None or evento.data_ocorrencia is None:
        return None
    observacao = " · ".join(x for x in (_OBSERVACAO_FIXA.get(codigo_marco), evento.observacao) if x) or None
    cnen = tipo in ("cnen_scra", "cnen_licenca")
    return DocumentoInstrumento(
        instrumento_id=evento.instrumento_id,
        tipo=tipo,
        numero=(evento.numero_documento or "").strip() or None,
        data_documento=evento.data_ocorrencia,
        status=_status_cnen(evento.status_regulatorio) if cnen else None,
        data_validade=evento.data_validade if tipo == "cnen_licenca" else None,
        observacao=observacao,
        origem_evento_id=evento.id,
    )


def migrar(db: Session, *, aplicar: bool) -> Counter[str]:
    """Cria os documentos faltantes e devolve a contagem por resultado. Sem `aplicar`, só conta."""
    contagem: Counter[str] = Counter()
    ja_migrados = set(
        db.scalars(
            select(DocumentoInstrumento.origem_evento_id).where(
                DocumentoInstrumento.origem_evento_id.is_not(None), DocumentoInstrumento.deletado_em.is_(None)
            )
        )
    )
    linhas = db.execute(
        select(EventoMarco, MarcoCatalogo.codigo)
        .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
        .where(
            MarcoCatalogo.codigo.in_(list(TIPO_POR_MARCO)),
            EventoMarco.substituido_por_id.is_(None),
            EventoMarco.deletado_em.is_(None),
        )
        .order_by(EventoMarco.id)
    ).all()
    for evento, codigo in linhas:
        tipo = TIPO_POR_MARCO[codigo]
        if evento.id in ja_migrados:
            contagem[f"{tipo}: já migrado"] += 1
            continue
        documento = documento_a_partir_do_evento(evento, codigo)
        if documento is None:
            contagem[f"{tipo}: descartado (sem data realizada)"] += 1
            continue
        contagem[f"{tipo}: migrado"] += 1
        if aplicar:
            db.add(documento)
    if aplicar:
        db.flush()
    return contagem
