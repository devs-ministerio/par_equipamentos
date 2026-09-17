"""Revisão de PropostaCandidata -- Radar de Convênios (fluxo em
docs/arquitetura/fluxo_requisicao.md). Candidato nasce do job de descoberta
(scripts/job_descoberta_transferegov.py); este router é onde a equipe
decide (aceitar/rejeitar) o que ele achou.

Aceitar reutiliza a mesma criação do POST /monitoramento/instrumentos, mas
sem `commit()` intermediário: instrumento, AuditLog e status da proposta são
confirmados numa transação só. nr_convenio usa `cd_parceria` quando existe
(código formal da parceria, mais próximo de um identificador real do sistema
novo) e só cai pro surrogate `str(id_proposta)` quando a proposta ainda não
virou parceria (achado 2026-09-15, pedido do usuário: "vamos usar
cd_parceria apenas quando existir") -- ver docstring de
PropostaCandidata.cd_parceria em app/db/models.py.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_current_user, require_monitoramento_editor
from app.db.base import get_db
from app.db.models import CnesEstabelecimento, PropostaCandidata, PropostaCandidataStatus, User
from app.repositories.propostas_candidatas import FiltrosPropostaCandidata, listar_propostas_paginadas
from app.services.propostas_candidatas import atualizar_cnes_proposta_candidata, revisar_proposta_candidata

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
    # -- o resumo *é* o dado da revisão. Extrair colunas derivadas fica pra
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
    status: PropostaCandidataStatus
    revisado_por: int | None
    revisado_em: datetime | None
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
    return [
        PropostaCandidataRead.model_validate(p).model_copy(update={"cnes_nome_estabelecimento": nomes.get(p.cnes)})
        for p in propostas
    ]


@router.get("", response_model=PropostaCandidataListaRead)
def listar_propostas_candidatas(
    status: PropostaCandidataStatus | None = None,
    uf: str | None = None,
    busca: str | None = None,
    ano: int | None = None,
    id_programa: int | None = None,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    """Leitura autenticada (Plan Mode seguranca 2026-09-16, Bloco 1 -- radar
    de propostas expõe estado de revisão interno, não é dado público de
    convênio já firmado) -- só a revisão (POST .../revisar) exige editor.
    Paginação e filtros SQL simples no banco; o front ainda pode pedir
    `tamanho_pagina=500` enquanto filtros derivados de `metas_resumo`
    (equipamento / situação de fato / "novas") permanecem client-side."""
    filtros = FiltrosPropostaCandidata(status=status, uf=uf, busca=busca, ano=ano, id_programa=id_programa)
    total, itens = listar_propostas_paginadas(db, filtros=filtros, pagina=pagina, tamanho_pagina=tamanho_pagina)
    return PropostaCandidataListaRead(total=total, itens=_com_nome_cnes(db, itens))


class DecisaoRevisao(str, Enum):
    aceita = "aceita"
    rejeitada = "rejeitada"


class RevisarPropostaBody(BaseModel):
    decisao: DecisaoRevisao


@router.post("/{proposta_id}/revisar", response_model=PropostaCandidataRead)
def revisar_proposta(
    proposta_id: int,
    corpo: RevisarPropostaBody,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    proposta = revisar_proposta_candidata(
        db=db,
        proposta_id=proposta_id,
        decisao=corpo.decisao.value,
        usuario=usuario,
    )
    return _com_nome_cnes(db, [proposta])[0]


class PropostaCandidataCnesUpdate(BaseModel):
    cnes: str | None = None


@router.patch("/{proposta_id}/cnes", response_model=PropostaCandidataRead)
def atualizar_cnes(
    proposta_id: int,
    corpo: PropostaCandidataCnesUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Corrige o CNES extraído automaticamente na descoberta (ver
    `_extrair_cnes` em job_descoberta_transferegov.py) -- achado
    2026-09-16, pedido do usuário: "vamos deixar o campo cnes editável...
    só poderá editar por outro cnes válido na base de dados". `cnes=None`
    limpa o campo (proposta sem CNES identificável, equipe decide não
    aplicar nenhum candidato)."""
    proposta = atualizar_cnes_proposta_candidata(db=db, proposta_id=proposta_id, cnes=corpo.cnes, usuario=usuario)
    return _com_nome_cnes(db, [proposta])[0]
