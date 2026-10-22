"""Pré-condições internas da aprovação na transação do chamador.

Não insere carteira/decisão/aviso nem faz commit. Na aprovação, os locks
permanecem até o commit; a consulta HTTP usa wrapper que encerra a transação
sem escrever. Não usar o resultado como autorização para um POST posterior.
"""

from datetime import UTC, datetime
from decimal import Decimal

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db.models import User, UserRole, UserStatus
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError
from app.repositories import candidatos_legados as candidatos
from app.repositories import decisoes_legado as decisoes
from app.repositories import recapturas_legado as recapturas
from app.repositories import revisao_legado as repositorio
from app.schemas_aprovacao_legado import ReferenciaProvaLegado
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada
from app.schemas_revisao_legado import RevisaoLegadoPreparada
from app.services.candidato_revisado_legado import carregar_candidato_revisado
from app.services.projecao_legado import projetar_carteira
from app.services.prova_recaptura_legado import (
    hash_captura_promocao,
    validar_captura_promocao,
    validar_frescor_recaptura,
)


def preparar_revisao(
    *,
    db: Session,
    usuario_id: int,
    candidato_id: int,
    dados: ReferenciaProvaLegado,
) -> RevisaoLegadoPreparada:
    dados = ReferenciaProvaLegado.model_validate(dados.model_dump(include=set(ReferenciaProvaLegado.model_fields)))
    usuario = autorizar_revisor(db=db, usuario_id=usuario_id)
    candidatos.bloquear_lote(db)
    registro = decisoes.bloquear_candidato(db, candidato_id)
    if registro is None:
        raise NotFoundError("Candidato não encontrado.")
    decisao = decisoes.ultima_decisao(db, registro.id)
    versao = decisao.id if decisao else 0
    estado = decisao.situacao if decisao else "novo"
    if estado not in ("novo", "em_analise"):
        raise ConflictError("A análise deste candidato já foi encerrada.")
    if dados.versao != versao or dados.captura_id != registro.ultima_captura_id:
        raise ConflictError("O candidato mudou. Atualize a revisão antes de aprovar.")
    if repositorio.numero_na_carteira(db, registro.numero):
        raise ConflictError("O instrumento já está na carteira e não pode ser sobrescrito.")
    descoberta = candidatos.obter_capturas(db, {dados.captura_id}).get(dados.captura_id)
    if (
        descoberta is None
        or descoberta.candidato_id != registro.id
        or descoberta.origem != "siconv_oficial"
        or not descoberta.elegivel
    ):
        raise ConflictError("A descoberta não confirma candidato oficial elegível.")
    prova = recapturas.obter_ultima(db, registro.id)
    if prova is None or prova.id != dados.recaptura_id or prova.captura_id != dados.captura_id:
        raise ConflictError("Revise a última recaptura oficial deste candidato.")
    rodada = recapturas.obter_fonte(db, prova.fonte_captura_id)
    if rodada is None or rodada.fonte != "siconv_recaptura" or rodada.status != "ok":
        raise ConflictError("A recaptura não possui rodada oficial completa.")
    agora = datetime.now(UTC)
    validar_frescor_recaptura(capturado_em=rodada.iniciado_em, agora=agora)
    if rodada.finalizado_em < rodada.iniciado_em or rodada.finalizado_em > agora:
        raise ConflictError("O horário da rodada oficial é inconsistente.")
    try:
        origem = OrigemRecapturaColetada.model_validate(rodada.detalhes)
        captura = CapturaLegadoParaPromocao.model_validate(prova.payload_oficial)
        candidato = carregar_candidato_revisado(db=db, registro=registro, descoberta=descoberta)
    except ValidationError as exc:
        raise ConflictError("A prova armazenada está incompleta ou inválida. Realize nova recaptura.") from exc
    if origem.iniciado_em != rodada.iniciado_em:
        raise ConflictError("A proveniência da prova não corresponde à rodada oficial.")
    hash_atual = hash_captura_promocao(captura)
    if prova.hash_conteudo != hash_atual or prova.hash_conteudo != dados.hash_revisado:
        raise ConflictError("A evidência oficial diverge da revisão. Realize nova recaptura.")
    if (prova.situacao, prova.valor_global) != (
        captura.convenio.SIT_CONVENIO,
        Decimal(captura.convenio.VL_GLOBAL_CONV.replace(",", ".")),
    ):
        raise ConflictError("A projeção armazenada diverge da prova oficial.")
    validar_captura_promocao(candidato=candidato, captura=captura, hash_revisado=dados.hash_revisado)
    return RevisaoLegadoPreparada.model_validate(
        {
            "usuario_id": usuario.id,
            "candidato_id": registro.id,
            "captura_id": descoberta.id,
            "recaptura_id": prova.id,
            "fonte_captura_id": rodada.id,
            "versao": versao,
            "situacao_anterior": estado,
            "hash_conteudo": hash_atual,
            "projecao": projetar_carteira(captura),
        }
    )


def autorizar_revisor(*, db: Session, usuario_id: int) -> User:
    """Reconsulta a autorização atual antes de acessar a prova por ID."""
    usuario = repositorio.bloquear_usuario_atual(db, usuario_id)
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
    return usuario
