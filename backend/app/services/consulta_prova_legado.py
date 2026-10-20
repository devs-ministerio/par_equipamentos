"""Consulta gerencial sem aprovação, coleta externa ou retenção de locks HTTP."""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.domain_errors import ConflictError, NotFoundError
from app.repositories import candidatos_legados as candidatos
from app.repositories import decisoes_legado as decisoes
from app.repositories import recapturas_legado as recapturas
from app.schemas_aprovacao_legado import ProvaLegadoRead, ReferenciaProvaLegado
from app.services.revisao_legado import autorizar_revisor, preparar_revisao


def consultar_prova(*, db: Session, usuario_id: int, candidato_id: int) -> ProvaLegadoRead:
    """Usa a mesma validação da aprovação e encerra a transação de leitura.

    O resumo não é autorização persistida: o POST revalida toda a prova sob
    novos locks. Nunca manter transação aberta enquanto a pessoa lê a tela.
    Usar exclusivamente com a sessão dedicada à requisição de consulta.
    """
    try:
        autorizar_revisor(db=db, usuario_id=usuario_id)
        candidatos.bloquear_lote(db)
        registro = decisoes.bloquear_candidato(db, candidato_id)
        if registro is None:
            raise NotFoundError("Candidato não encontrado.")
        prova = recapturas.obter_ultima(db, registro.id)
        if prova is None:
            raise ConflictError("Ainda não há recaptura oficial para conferência. Aguarde nova consulta da fonte.")
        decisao = decisoes.ultima_decisao(db, registro.id)
        referencia = ReferenciaProvaLegado(
            captura_id=prova.captura_id,
            recaptura_id=prova.id,
            hash_revisado=prova.hash_conteudo,
            versao=decisao.id if decisao else 0,
        )
        revisao = preparar_revisao(db=db, usuario_id=usuario_id, candidato_id=candidato_id, dados=referencia)
        rodada = recapturas.obter_fonte(db, revisao.fonte_captura_id)
        if rodada is None:
            raise ConflictError("A recaptura não possui rodada oficial completa.")
        return ProvaLegadoRead(
            **referencia.model_dump(),
            candidato_id=revisao.candidato_id,
            numero=revisao.projecao.numero,
            situacao=revisao.projecao.situacao,
            valor_global=revisao.projecao.valor_global,
            convenente_nome=revisao.projecao.convenente_nome,
            municipio=revisao.projecao.municipio,
            uf=revisao.projecao.uf,
            capturado_em=rodada.iniciado_em,
            expira_em=rodada.iniciado_em + timedelta(hours=24),
        )
    finally:
        db.rollback()
