"""Acesso a PropostaCandidata pra o relatório de instrumentos e repasse
(Plan Mode docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 4) --
"linhas de financiamento" ainda não viradas convênio (TransfereGov novo).

Independente de `app/repositories/propostas_candidatas.py::FiltrosPropostaCandidata`
de propósito -- aquele filtro aceita só 1 UF por vez (uso de UI paginada);
o relatório de escopo=região precisa de uma lista de UFs, sem paginação.
"""

from __future__ import annotations

from sqlalchemy import extract, select
from sqlalchemy.orm import Session

from app.db.models import PropostaCandidata
from app.pipeline.texto import normalizar_texto

# Teto de segurança do relatório -- mesmo espírito do Bloco 4 do Plan Mode
# consolidação 2026-09-17 (não é paginação de UI).
LIMITE_RELATORIO = 5000


def listar_propostas_filtradas(
    db: Session,
    *,
    ufs: list[str] | None = None,
    municipio: str | None = None,
    ano: int | None = None,
) -> list[PropostaCandidata]:
    # Sem `programa`/`situacao` de propósito (achado ao vivo, Bloco 7):
    # `nm_programa`/`situacao_proposta` usam vocabulário do TransfereGov
    # novo, diferente do `Convenio.programa`/`situacao` (SICONV) -- não dá
    # pra reaproveitar o mesmo valor de filtro entre as duas fontes sem
    # risco de filtrar pra um conjunto vazio. Só `uf`/`ano` são
    # comparáveis 1:1.
    stmt = select(PropostaCandidata)
    if ufs:
        stmt = stmt.where(PropostaCandidata.uf.in_(ufs))
    if ano is not None:
        stmt = stmt.where(extract("year", PropostaCandidata.data_proposta) == ano)
    stmt = stmt.order_by(PropostaCandidata.data_proposta.desc().nulls_last()).limit(LIMITE_RELATORIO)
    resultado = list(db.execute(stmt).scalars().all())
    if municipio:
        alvo = normalizar_texto(municipio)
        resultado = [p for p in resultado if normalizar_texto(p.municipio) == alvo]
    return resultado
