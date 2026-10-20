"""Monta a evidência revisada com dados do banco, nunca do navegador."""

from sqlalchemy.orm import Session

from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoRegistro
from app.repositories import candidatos_legados as candidatos
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado


def carregar_candidato_revisado(
    *,
    db: Session,
    registro: CandidatoLegadoRegistro,
    descoberta: CandidatoLegadoCaptura,
) -> CandidatoLegado:
    evidencias = candidatos.evidencias_por_captura(db, {descoberta.id}).get(descoberta.id, [])
    return CandidatoLegado.model_validate(
        {
            "numero": registro.numero,
            "id_proposta": registro.id_proposta,
            "evidencias": [
                EvidenciaLegado(
                    id_item=e.id_item, codigo_equipamento=e.codigo, descricao=e.descricao, relacao=e.relacao
                )
                for e in evidencias
            ],
            "componentes": candidatos.componentes_por_captura(db, {descoberta.id}).get(descoberta.id, []),
            "confirmacao_portal": descoberta.confirmacao_portal,
            "data_publicacao": descoberta.data_publicacao,
            "criterio_escopo": descoberta.criterio_escopo,
            "orgao_superior": descoberta.orgao_superior,
            "data_assinatura_siconv": descoberta.data_assinatura_siconv,
            "data_publicacao_siconv": descoberta.data_publicacao_siconv,
        }
    )
