"""Casos de uso de revisão de propostas candidatas."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.authz import assert_pode_editar_monitoramento
from app.db.models import PropostaCandidata, PropostaCandidataStatus, User
from app.domain_errors import ConflictError, NotFoundError
from app.repositories.propostas_candidatas import obter_proposta_para_revisao
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
        raise NotFoundError(f"Proposta candidata {proposta_id} não encontrada.")
    if proposta.status != PropostaCandidataStatus.pendente:
        raise ConflictError(f"Proposta {proposta_id} já foi revisada (status={proposta.status.value}).")

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
