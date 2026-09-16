"""Revisão de PropostaCandidata -- Radar de Convênios (fluxo em
docs/arquitetura/fluxo_requisicao.md). Candidato nasce do job de descoberta
(scripts/job_descoberta_transferegov.py); este router é onde a equipe
decide (aceitar/rejeitar) o que ele achou.

Aceitar chama `criar_instrumento` (app/routers/monitoramento.py) direto --
mesmo POST /monitoramento/instrumentos, mesma checagem de duplicidade e
mesmo AuditLog -- em vez de duplicar a lógica de criação. nr_convenio usa
`cd_parceria` quando existe (código formal da parceria, mais próximo de um
identificador real do sistema novo) e só cai pro surrogate
`str(id_proposta)` quando a proposta ainda não virou parceria (achado
2026-09-15, pedido do usuário: "vamos usar cd_parceria apenas quando
existir") -- ver docstring de PropostaCandidata.cd_parceria em
app/db/models.py.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_monitoramento_editor
from app.db.base import get_db
from app.db.models import CnesEstabelecimento, PropostaCandidata, PropostaCandidataStatus, User
from app.routers.monitoramento import InstrumentoEquipamentoCreate, criar_instrumento

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
    metas_resumo: dict | None
    cnes: str | None
    tem_parceria: bool
    cd_parceria: str | None
    status: PropostaCandidataStatus
    revisado_por: int | None
    revisado_em: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[PropostaCandidataRead])
def listar_propostas_candidatas(
    status: PropostaCandidataStatus | None = None,
    db: Session = Depends(get_db),
):
    """Leitura pública (mesmo padrão de GET /monitoramento/instrumentos) --
    só a revisão (POST .../revisar) exige editor. Sem `status` devolve
    tudo; a aba "Propostas pendentes" do front passa status=pendente."""
    query = select(PropostaCandidata).order_by(PropostaCandidata.created_at.desc())
    if status is not None:
        query = query.where(PropostaCandidata.status == status)
    return db.execute(query).scalars().all()


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
    proposta = db.execute(
        select(PropostaCandidata).where(PropostaCandidata.id == proposta_id)
    ).scalar_one_or_none()
    if proposta is None:
        raise HTTPException(404, f"Proposta candidata {proposta_id} não encontrada.")
    if proposta.status != PropostaCandidataStatus.pendente:
        raise HTTPException(409, f"Proposta {proposta_id} já foi revisada (status={proposta.status.value}).")

    if corpo.decisao == DecisaoRevisao.aceita:
        # Mesmo POST /monitoramento/instrumentos que o cadastro manual usa
        # -- 409 se nr_convenio=str(id_proposta) já existir (não deveria,
        # dedup de id_proposta em proposta_candidata já impede duplicata,
        # mas a checagem em criar_instrumento cobre qualquer inconsistência).
        criar_instrumento(
            InstrumentoEquipamentoCreate(
                nr_convenio=proposta.cd_parceria or str(proposta.id_proposta),
                cnpj_convenente=proposta.cnpj_ente_recebedor,
                nome_convenente=proposta.nm_proponente,
                tipo_contratacao="Parceria TransfereGov",
                municipio=proposta.municipio,
                uf=proposta.uf,
                cnes=proposta.cnes,
                programa=proposta.nm_programa,
                componente=proposta.componente_batido,
            ),
            db=db,
            usuario=usuario,
        )
        proposta.status = PropostaCandidataStatus.aceita
    else:
        proposta.status = PropostaCandidataStatus.rejeitada

    proposta.revisado_por = usuario.id
    proposta.revisado_em = datetime.now(timezone.utc)
    db.commit()
    db.refresh(proposta)
    return proposta


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
    proposta = db.execute(
        select(PropostaCandidata).where(PropostaCandidata.id == proposta_id)
    ).scalar_one_or_none()
    if proposta is None:
        raise HTTPException(404, f"Proposta candidata {proposta_id} não encontrada.")
    if corpo.cnes is not None and db.get(CnesEstabelecimento, corpo.cnes.zfill(7)) is None:
        raise HTTPException(422, f"CNES {corpo.cnes} não encontrado na base de referência.")
    proposta.cnes = corpo.cnes.zfill(7) if corpo.cnes else None
    db.commit()
    db.refresh(proposta)
    return proposta
