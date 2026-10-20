"""Aprovação transacional da prova persistida; autorização sempre no Service."""

from datetime import UTC, datetime

from pydantic import TypeAdapter
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Notificacao, NotificacaoTipo, UserRole, UserStatus
from app.db.models_legado import CandidatoLegadoDecisao
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError
from app.equipamentos import classificar_descricoes
from app.repositories import candidatos_legados as candidatos
from app.repositories import carteira_legado as carteira
from app.repositories import decisoes_legado as decisoes
from app.repositories import recapturas_legado as recapturas
from app.repositories import revisao_legado as revisao_repo
from app.repositories.notificacoes import criar_notificacao
from app.schemas_aprovacao_legado import AprovacaoLegadoCreate, AprovacaoLegadoRead
from app.schemas_captura_legado import ItemRecapturado
from app.services.equipamento_marcadores import DadosMarcador, registrar_marcadores
from app.services.prova_recaptura_legado import validar_frescor_recaptura
from app.services.revisao_legado import preparar_revisao


def aprovar_entrada(
    *,
    db: Session,
    usuario_id: int,
    candidato_id: int,
    dados: AprovacaoLegadoCreate,
) -> AprovacaoLegadoRead:
    try:
        dados = AprovacaoLegadoCreate.model_validate(dados.model_dump())
        usuario = revisao_repo.bloquear_usuario_atual(db, usuario_id)
        if (
            usuario is None
            or usuario.deleted_at is not None
            or usuario.status != UserStatus.active
            or usuario.role
            not in (
                UserRole.admin,
                UserRole.gestor,
            )
        ):
            raise AuthorizationError("Somente gestor e admin ativos podem aprovar entradas do Radar.")
        candidatos.bloquear_lote(db)
        registro = decisoes.bloquear_candidato(db, candidato_id)
        if registro is None:
            raise NotFoundError("Candidato não encontrado.")
        replay = decisoes.obter_replay(db, candidato_id, dados.chave)
        if replay is not None:
            prova = recapturas.obter_por_identidade(db, dados.recaptura_id, dados.captura_id, candidato_id)
            if (
                prova is None
                or replay.situacao != "aprovado"
                or (
                    replay.usuario_id,
                    replay.captura_id,
                    replay.recaptura_id,
                    replay.justificativa,
                    decisoes.versao_antes_de(db, candidato_id, replay.id),
                    prova.hash_conteudo,
                )
                != (
                    usuario.id,
                    dados.captura_id,
                    dados.recaptura_id,
                    dados.justificativa,
                    dados.versao,
                    dados.hash_revisado,
                )
            ):
                raise ConflictError("Chave de aprovação já utilizada com outros dados.")
            resultado = AprovacaoLegadoRead.model_validate(replay)
            db.commit()
            return resultado
        revisao = preparar_revisao(db=db, usuario_id=usuario.id, candidato_id=candidato_id, dados=dados)
        convenio = carteira.adicionar(db, revisao.projecao)
        # Usa o classificador existente; componente não inventa equipamento.
        bruto = revisao.projecao.siconv_raw["itens_plano_aplicacao"]
        itens = TypeAdapter(list[ItemRecapturado]).validate_python(bruto)
        descricoes = [item.DESCRICAO_ITEM for item in itens]
        marcadores = [
            DadosMarcador(
                evidencia=e,
                tipo_evidencia="item_orcamentario",
                confianca=100,
                origem_dado=f"siconv_recaptura:{revisao.recaptura_id}",
            )
            for e in classificar_descricoes(descricoes)
            if e.relacao in ("aquisicao", "modernizacao")
        ]
        registrar_marcadores(db=db, origem="convenio", origem_id=convenio.id, marcadores=marcadores)
        decisao = CandidatoLegadoDecisao(
            candidato_id=candidato_id,
            captura_id=dados.captura_id,
            recaptura_id=dados.recaptura_id,
            convenio_id=convenio.id,
            usuario_id=usuario.id,
            chave=dados.chave,
            situacao_anterior=revisao.situacao_anterior,
            situacao="aprovado",
            justificativa=dados.justificativa,
        )
        decisoes.adicionar(db, decisao)
        criar_notificacao(
            db,
            Notificacao(
                tipo=NotificacaoTipo.aprovacao_carteira,
                titulo=f"Entrada aprovada: convênio {convenio.numero}",
                corpo="Convênio aprovado para a carteira de Instrumentos firmados. O monitoramento interno não foi iniciado.",
                entidade_id=convenio.id,
            ),
        )
        rodada = recapturas.obter_fonte(db, revisao.fonte_captura_id)
        if rodada is None:
            raise ConflictError("Rodada oficial indisponível.")
        validar_frescor_recaptura(capturado_em=rodada.iniciado_em, agora=datetime.now(UTC))
        resultado = AprovacaoLegadoRead.model_validate(decisao)
        db.commit()
        return resultado
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("A aprovação conflita com o histórico ou com a carteira existente.") from exc
    except Exception:
        db.rollback()
        raise
