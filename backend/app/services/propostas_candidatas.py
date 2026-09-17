"""Casos de uso de revisão de propostas candidatas."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.authz import assert_pode_editar_monitoramento
from app.db.models import PropostaCandidata, PropostaCandidataStatus, User
from app.repositories.propostas_candidatas import existe_cnes, obter_proposta, obter_proposta_para_revisao
from app.services.monitoramento_instrumentos import NovoInstrumentoMonitorado, criar_instrumento_monitorado


def revisar_proposta_candidata(
    *,
    db: Session,
    proposta_id: int,
    decisao: str,
    usuario: User,
) -> PropostaCandidata:
    assert_pode_editar_monitoramento(usuario)
    proposta = obter_proposta_para_revisao(db, proposta_id)
    if proposta is None:
        raise HTTPException(404, f"Proposta candidata {proposta_id} não encontrada.")
    if proposta.status != PropostaCandidataStatus.pendente:
        raise HTTPException(409, f"Proposta {proposta_id} já foi revisada (status={proposta.status.value}).")

    if decisao == "aceita":
        criar_instrumento_monitorado(
            dados=NovoInstrumentoMonitorado(
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


def atualizar_cnes_proposta_candidata(
    *,
    db: Session,
    proposta_id: int,
    cnes: str | None,
    usuario: User,
) -> PropostaCandidata:
    assert_pode_editar_monitoramento(usuario)
    proposta = obter_proposta(db, proposta_id)
    if proposta is None:
        raise HTTPException(404, f"Proposta candidata {proposta_id} não encontrada.")

    cnes_normalizado = cnes.zfill(7) if cnes else None
    if cnes_normalizado is not None and not existe_cnes(db, cnes_normalizado):
        raise HTTPException(422, f"CNES {cnes} não encontrado na base de referência.")

    proposta.cnes = cnes_normalizado
    db.commit()
    db.refresh(proposta)
    return proposta
