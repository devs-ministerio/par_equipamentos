"""Triagem auditável; nunca inventa dados nem inclui monitoramento."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import User, UserRole, UserStatus
from app.db.models_legado import CandidatoLegadoDecisao
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError
from app.repositories import candidatos_legados as candidatos
from app.repositories import decisoes_legado as repositorio
from app.schemas_legado import DecisaoLegadoCreate, DecisaoLegadoRead, HistoricoLegadoRead


def registrar_decisao(
    *, db: Session, usuario: User, candidato_id: int, dados: DecisaoLegadoCreate
) -> DecisaoLegadoRead:
    if usuario.status != UserStatus.active or usuario.role not in (UserRole.admin, UserRole.gestor):
        raise AuthorizationError("Somente gestor e admin podem decidir sobre entradas do Radar.")
    try:
        registro = repositorio.bloquear_candidato(db, candidato_id)
        if registro is None:
            raise NotFoundError("Candidato não encontrado.")
        situacao = "em_analise" if dados.acao == "iniciar_analise" else "rejeitado"
        replay = repositorio.obter_replay(db, candidato_id, dados.chave)
        if replay:
            if (replay.usuario_id, replay.captura_id, replay.situacao, replay.justificativa) != (
                usuario.id,
                dados.captura_id,
                situacao,
                dados.justificativa,
            ):
                raise ConflictError("Chave de decisão já utilizada com outros dados.")
            resultado = DecisaoLegadoRead.model_validate(replay)
            db.commit()
            return resultado
        anterior = repositorio.ultima_decisao(db, candidato_id)
        versao = anterior.id if anterior else 0
        estado = anterior.situacao if anterior else "novo"
        if dados.versao != versao or dados.captura_id != registro.ultima_captura_id:
            raise ConflictError("O candidato mudou. Atualize o Radar antes de decidir.")
        captura = candidatos.obter_capturas(db, {dados.captura_id}).get(dados.captura_id)
        if captura is None or captura.origem != "siconv_oficial":
            raise ConflictError("Somente descobertas da fonte oficial podem ser analisadas no Radar.")
        if estado not in ("novo", "em_analise") or (situacao == "em_analise" and estado != "novo"):
            raise ConflictError("A situação atual não permite esta decisão.")
        decisao = CandidatoLegadoDecisao(
            candidato_id=candidato_id,
            captura_id=dados.captura_id,
            usuario_id=usuario.id,
            chave=dados.chave,
            situacao_anterior=estado,
            situacao=situacao,
            justificativa=dados.justificativa,
        )
        repositorio.adicionar(db, decisao)
        resultado = DecisaoLegadoRead.model_validate(decisao)
        db.commit()
        return resultado
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("Decisão conflita com o histórico do candidato.") from exc
    except Exception:
        db.rollback()
        raise


def consultar_historico(*, db: Session, candidato_id: int, pagina: int, tamanho: int) -> HistoricoLegadoRead:
    # Leitura autenticada por rota, disponível à equipe como o próprio Radar.
    if not candidatos.obter_por_id(db, candidato_id):
        raise NotFoundError("Candidato não encontrado.")
    return repositorio.listar_historico(db, candidato_id, pagina, tamanho)
