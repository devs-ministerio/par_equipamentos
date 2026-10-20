"""Grava prova do coletor confiável, sem aprovar ou incorporar instrumento.

Não expor como endpoint de upload: payload, hashes e horário de origem devem
vir da coleta no servidor, nunca do navegador. Worker local em
scripts/job_recaptura_legado_local.py; automação de produção não habilitada.
"""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import FonteCaptura
from app.db.models_recaptura_legado import CandidatoLegadoRecaptura
from app.domain_errors import ConflictError, NotFoundError
from app.repositories import candidatos_legados as candidatos
from app.repositories import decisoes_legado as decisoes
from app.repositories import recapturas_legado as repositorio
from app.repositories.capturas_fonte import adicionar_captura
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada
from app.schemas_recaptura_persistencia import RecapturaPersistida, ReferenciaRecaptura
from app.services.candidato_revisado_legado import carregar_candidato_revisado
from app.services.prova_recaptura_legado import (
    hash_captura_promocao,
    validar_captura_promocao,
    validar_frescor_recaptura,
)


def preparar_alvo_coleta(*, db: Session, candidato_id: int) -> AlvoRecapturaLegado:
    """Sessão dedicada: termina a leitura antes de qualquer download externo.

    Não mantém locks durante a rede. registrar_recaptura revalida a referência
    sob lock ao publicar, inclusive se uma decisão encerrar a análise no meio.
    """
    try:
        registro = candidatos.obter_por_id(db, candidato_id)
        if registro is None:
            raise NotFoundError("Candidato não encontrado.")
        if registro.ultima_captura_id is None:
            raise ConflictError("Candidato sem descoberta oficial.")
        descoberta = candidatos.obter_capturas(db, {registro.ultima_captura_id}).get(registro.ultima_captura_id)
        if (
            descoberta is None
            or descoberta.candidato_id != registro.id
            or not descoberta.elegivel
            or descoberta.origem != "siconv_oficial"
        ):
            raise ConflictError("Recaptura exige descoberta oficial elegível.")
        if descoberta.criterio_escopo != "prioritarios_ms_celebrados_v2" or descoberta.orgao_superior != "36000":
            raise ConflictError("Atualize a descoberta para comprovar o escopo institucional vigente.")
        if descoberta.confirmacao_portal != "confirmado":
            raise ConflictError("Recaptura exige confirmação prévia no Portal.")
        decisao = decisoes.ultima_decisao(db, registro.id)
        if decisao is not None and decisao.situacao not in ("novo", "em_analise"):
            raise ConflictError("A análise deste candidato já foi encerrada.")
        return AlvoRecapturaLegado(
            candidato_id=registro.id, captura_id=descoberta.id, numero=registro.numero, id_proposta=registro.id_proposta
        )
    finally:
        db.rollback()


def registrar_recaptura(
    *,
    db: Session,
    referencia: ReferenciaRecaptura,
    captura: CapturaLegadoParaPromocao,
    origem: OrigemRecapturaColetada,
) -> RecapturaPersistida:
    """Lock candidato → validar prova → rodada + recaptura no mesmo commit."""
    try:
        # Reparse: model_copy e coleções mutáveis podem contornar validação prévia.
        referencia = ReferenciaRecaptura.model_validate(referencia.model_dump())
        captura = CapturaLegadoParaPromocao.model_validate(captura.model_dump())
        origem = OrigemRecapturaColetada.model_validate(origem.model_dump())
        agora = datetime.now(UTC)
        validar_frescor_recaptura(capturado_em=origem.iniciado_em, agora=agora)
        # Mesmo lock da descoberta: impede troca de baseline durante a gravação.
        candidatos.bloquear_lote(db)
        registro = decisoes.bloquear_candidato(db, referencia.candidato_id)
        if registro is None:
            raise NotFoundError("Candidato não encontrado.")
        if registro.ultima_captura_id != referencia.captura_id:
            raise ConflictError("A descoberta mudou durante a consulta. Atualize o Radar.")
        descoberta = candidatos.obter_capturas(db, {referencia.captura_id}).get(referencia.captura_id)
        if descoberta is None or descoberta.candidato_id != registro.id:
            raise ConflictError("A captura não corresponde ao candidato.")
        if descoberta.origem != "siconv_oficial" or not descoberta.elegivel:
            raise ConflictError("O candidato não possui descoberta oficial elegível.")
        decisao = decisoes.ultima_decisao(db, registro.id)
        if decisao is not None and decisao.situacao not in ("novo", "em_analise"):
            raise ConflictError("A análise deste candidato já foi encerrada.")
        candidato = carregar_candidato_revisado(db=db, registro=registro, descoberta=descoberta)
        hash_conteudo = hash_captura_promocao(captura)
        validar_captura_promocao(candidato=candidato, captura=captura, hash_revisado=hash_conteudo)
        detalhes = origem.model_dump(mode="json")
        replay = repositorio.obter_tentativa(db, registro.id, origem.iniciado_em)
        if replay is not None:
            prova, rodada = replay
            if (prova.captura_id, prova.hash_conteudo, rodada.status, rodada.detalhes) != (
                referencia.captura_id,
                hash_conteudo,
                "ok",
                detalhes,
            ):
                raise ConflictError("A tentativa de recaptura já foi registrada com outra evidência.")
            resultado = RecapturaPersistida.model_validate(prova)
            db.commit()
            return resultado
        rodada = FonteCaptura(
            fonte="siconv_recaptura",
            iniciado_em=origem.iniciado_em,
            finalizado_em=agora,
            status="ok",
            itens_verificados=1,
            itens_alterados=1,
            detalhes=detalhes,
        )
        adicionar_captura(db, rodada)
        prova = CandidatoLegadoRecaptura(
            candidato_id=registro.id,
            captura_id=descoberta.id,
            fonte_captura_id=rodada.id,
            hash_conteudo=hash_conteudo,
            situacao=captura.convenio.SIT_CONVENIO,
            valor_global=Decimal(captura.convenio.VL_GLOBAL_CONV.replace(",", ".")),
            payload_oficial=captura.model_dump(mode="json"),
        )
        repositorio.adicionar(db, prova)
        resultado = RecapturaPersistida.model_validate(prova)
        db.commit()
        return resultado
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("A recaptura conflita com o histórico do candidato.") from exc
    except Exception:
        db.rollback()
        raise
