"""Leitura das propostas descobertas pelo Radar de Convênios.

A inclusão no monitoramento é explícita na interface e reutiliza
``POST /monitoramento/instrumentos``. Esta rota não mantém um ciclo interno
de aceite/rejeição.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import CnesEstabelecimento, PropostaCandidata, User
from app.repositories.equipamento_marcadores import listar_por_origens
from app.repositories.propostas_candidatas import FiltrosPropostaCandidata, listar_propostas_paginadas
from app.schemas_equipamentos import EquipamentoMarcadorRead, serializar_marcadores

router = APIRouter(prefix="/propostas-candidatas", tags=["propostas-candidatas"])


class PropostaCandidataRead(BaseModel):
    id: int
    id_proposta: int
    cnpj_ente_recebedor: str
    nm_proponente: str
    municipio: str | None
    uf: str | None
    ds_objeto: str
    nm_programa: str
    id_programa: int
    componente_batido: str
    equipamentos: list[EquipamentoMarcadorRead] = Field(default_factory=list)
    equipamento_detectado: str | None
    # float, não Decimal -- Pydantic v2 serializa Decimal como STRING no
    # JSON (perde precisão de float de propósito), quebrando o parse do
    # lado do front sem erro visível (achado 2026-09-15, mesma convenção
    # de MarcoCatalogoRead.execucao_fisica_pct_referencia acima).
    vl_global_proposta: float | None
    situacao_proposta: str | None
    data_proposta: date | None
    # Mantido na listagem de propósito: o card e os filtros client-side
    # (situação de fato, equipamento via itens) ainda leem o JSON. Diferente
    # de `convenio.siconv_raw`, aqui não há payload "cru de detalhe" separado
    # -- o resumo *é* o dado exibido. Extrair colunas derivadas fica pra
    # bloco futuro, quando o filtro de equipamento/situação subir pro SQL.
    metas_resumo: dict | None
    cnes: str | None
    # Achado 2026-09-16, pedido do usuário: "aplique tudo que pedi para
    # instrumentos firmados em Linhas de financiamento" -- mesmo padrão de
    # `ConvenioRead.cnes_nome_estabelecimento` (convenios.py): não é coluna
    # de `PropostaCandidata`, resolvido em lote por `cnes` (ver `_com_nome_cnes`).
    cnes_nome_estabelecimento: str | None = None
    tem_parceria: bool
    cd_parceria: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PropostaCandidataListaRead(BaseModel):
    total: int
    itens: list[PropostaCandidataRead]


def _com_nome_cnes(db: Session, propostas: list[PropostaCandidata]) -> list[PropostaCandidataRead]:
    codigos = {p.cnes for p in propostas if p.cnes}
    nomes = {}
    if codigos:
        nomes = {
            row.cnes: row.nome_estabelecimento
            for row in db.execute(select(CnesEstabelecimento).where(CnesEstabelecimento.cnes.in_(codigos))).scalars()
        }
    marcadores = listar_por_origens(db, proposta_ids={p.id for p in propostas})
    return [
        PropostaCandidataRead.model_validate(p).model_copy(
            update={
                "cnes_nome_estabelecimento": nomes.get(p.cnes or ""),
                "equipamentos": serializar_marcadores(marcadores.get(("proposta_candidata", p.id), [])),
            }
        )
        for p in propostas
    ]


@router.get("", response_model=PropostaCandidataListaRead)
def listar_propostas_candidatas(
    uf: str | None = None,
    busca: str | None = None,
    ano: int | None = None,
    id_programa: int | None = None,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    """Leitura autenticada do radar de propostas.

    Paginação e filtros SQL simples no banco; o front ainda pode pedir
    `tamanho_pagina=500` enquanto filtros derivados de `metas_resumo`
    (equipamento / situação de fato / "novas") permanecem client-side."""
    filtros = FiltrosPropostaCandidata(uf=uf, busca=busca, ano=ano, id_programa=id_programa)
    total, itens = listar_propostas_paginadas(db, filtros=filtros, pagina=pagina, tamanho_pagina=tamanho_pagina)
    return PropostaCandidataListaRead(total=total, itens=_com_nome_cnes(db, itens))
