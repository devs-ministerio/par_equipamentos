"""Leitura de macro_coverage (Fase Unificacao) -- so GET. A escrita e feita
por scripts/run_pipeline_tomografo.py (Modulo 5, DEMAS+SIDRA+ElastiCNES),
nao por um endpoint ainda (execucao sob demanda via API fica pra quando o
fluxo gerar automatico/manual for retomado).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas import MacroCoverageRead
from app.services import cobertura_assistencial as servico

router = APIRouter(prefix="/macro-coverage", tags=["macro-coverage"])


@router.get("", response_model=list[MacroCoverageRead])
def listar_macro_coverage(
    equipment_family: str | None = None,
    execution_id: int | None = None,
    macro_code: list[str] | None = Query(default=None),
    # Teto de seguranca, nao paginacao de UI (Bloco 4 do Plan Mode
    # consolidacao 2026-09-17) -- volume atual (~121 macrorregioes por
    # familia) fica bem abaixo disso; existe so pra nao devolver uma lista
    # sem limite nenhum se o dado crescer sem que ninguem perceba.
    limit: int = Query(default=1000, le=1000, gt=0),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
) -> list[MacroCoverageRead]:
    """Lista a cobertura por macrorregiao. Sem `execution_id`, usa a execucao
    mais recente (nao precisa ter conceito de competencia publicada ainda --
    isso e Modulo 5/7, nao existe nenhuma execucao alem da de seed hoje).
    `macro_code` e opcional -- usado pelo modal de detalhe do municipio pra
    buscar so a macro dele em vez da lista inteira (~121 linhas). Exige
    sessão (decisão do usuário 2026-09-17: todo o app fica atrás de login
    por enquanto, não só o monitoramento interno)."""
    return servico.listar_macro_coverage(
        db=db, equipment_family=equipment_family, execution_id=execution_id, macro_code=macro_code, limit=limit
    )
