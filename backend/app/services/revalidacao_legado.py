"""Ocultação auditável de falso positivo; não rejeita nem altera a carteira.

Uso interno após coleta integral no servidor. Não expor como endpoint de
upload: hashes e horário só são confiáveis quando produzidos pelo worker.
"""

import json
from datetime import UTC, datetime
from hashlib import sha256

from sqlalchemy.orm import Session

from app.db.models import FonteCaptura
from app.db.models_legado import CandidatoLegadoCaptura
from app.domain_errors import ConflictError, NotFoundError
from app.repositories import candidatos_legados as candidatos
from app.repositories import decisoes_legado as decisoes
from app.repositories.capturas_fonte import adicionar_captura
from app.repositories.descoberta_legado import numeros_legados_conhecidos
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_revalidacao_legado import EscopoLegadoColetado
from app.services.descoberta_prioritaria_ms import descobrir_prioritarios_ms
from app.services.prova_recaptura_legado import validar_frescor_recaptura


def preparar_revalidacao(*, db: Session, candidato_id: int) -> AlvoRecapturaLegado:
    """Aceita descoberta histórica sem v2; encerra leitura antes da rede."""
    if type(candidato_id) is not int or candidato_id <= 0:
        raise ValueError("Informe um único identificador positivo de candidato.")
    try:
        registro = candidatos.obter_por_id(db, candidato_id)
        if registro is None:
            raise NotFoundError("Candidato não encontrado.")
        if registro.ultima_captura_id is None:
            raise ConflictError("Candidato sem captura para revalidar.")
        captura = candidatos.obter_capturas(db, {registro.ultima_captura_id}).get(registro.ultima_captura_id)
        if captura is None or captura.candidato_id != registro.id or captura.origem != "siconv_oficial":
            raise ConflictError("Revalidação exige captura oficial do mesmo candidato.")
        decisao = decisoes.ultima_decisao(db, registro.id)
        if decisao and decisao.situacao not in ("novo", "em_analise"):
            raise ConflictError("A análise já foi encerrada; decisão humana preservada.")
        if registro.numero in numeros_legados_conhecidos(db):
            raise ConflictError("Instrumento já incorporado; a revalidação não altera a carteira.")
        return AlvoRecapturaLegado(
            candidato_id=registro.id,
            captura_id=registro.ultima_captura_id,
            numero=registro.numero,
            id_proposta=registro.id_proposta,
        )
    finally:
        db.rollback()


def registrar_inelegibilidade(
    *, db: Session, alvo: AlvoRecapturaLegado, escopo: EscopoLegadoColetado, _confirmar_transacao: bool = True
) -> int:
    """O ciclo integrado pode adiar o commit; em erro todo o ciclo é revertido."""
    try:
        alvo = AlvoRecapturaLegado.model_validate(alvo.model_dump())
        escopo = EscopoLegadoColetado.model_validate(escopo.model_dump())
        validar_frescor_recaptura(capturado_em=escopo.iniciado_em, agora=datetime.now(UTC))
        if (escopo.convenio.NR_CONVENIO, escopo.convenio.ID_PROPOSTA) != (alvo.numero, alvo.id_proposta):
            raise ConflictError("A fonte não corresponde à identidade histórica.")
        elegiveis = descobrir_prioritarios_ms(
            convenios=[escopo.convenio.model_dump()],
            propostas=[escopo.proposta.model_dump()],
            itens=[i.model_dump() for i in escopo.itens],
            programas=[p.model_dump() for p in escopo.programas],
            vinculos=[v.model_dump() for v in escopo.vinculos],
            conhecidos=set(),
        )
        if elegiveis:
            raise ConflictError("A fonte mantém o candidato no escopo. Atualize a descoberta, sem ocultá-lo.")
        candidatos.bloquear_lote(db)
        registro = decisoes.bloquear_candidato(db, alvo.candidato_id)
        if registro is None:
            raise NotFoundError("Candidato não encontrado.")
        if (registro.numero, registro.id_proposta) != (alvo.numero, alvo.id_proposta):
            raise ConflictError("Identidade histórica divergente.")
        decisao = decisoes.ultima_decisao(db, registro.id)
        if decisao and decisao.situacao not in ("novo", "em_analise"):
            raise ConflictError("A análise já foi encerrada; decisão humana preservada.")
        if registro.numero in numeros_legados_conhecidos(db):
            raise ConflictError("Instrumento já incorporado; a revalidação não altera a carteira.")
        anterior = candidatos.obter_capturas(db, {alvo.captura_id}).get(alvo.captura_id)
        if anterior is None or anterior.candidato_id != registro.id or anterior.origem != "siconv_oficial":
            raise ConflictError("Revalidação exige captura oficial do mesmo candidato.")
        digest = sha256(
            json.dumps(
                {"alvo": alvo.model_dump(mode="json"), "escopo": escopo.model_dump(mode="json")}, sort_keys=True
            ).encode()
        ).hexdigest()
        atual = candidatos.obter_capturas(db, {registro.ultima_captura_id or 0}).get(registro.ultima_captura_id or 0)
        if atual and not atual.elegivel and atual.hash_conteudo == digest:
            if _confirmar_transacao:
                db.commit()
            return atual.id
        if registro.ultima_captura_id != alvo.captura_id:
            raise ConflictError("A captura mudou durante a consulta; refaça a revalidação.")
        rodada = FonteCaptura(
            fonte="siconv_revalidacao",
            iniciado_em=escopo.iniciado_em,
            finalizado_em=datetime.now(UTC),
            status="ok",
            itens_verificados=1,
            itens_alterados=1,
            detalhes={
                "operacao": "revalidacao_escopo",
                "captura_anterior_id": anterior.id,
                "hashes_escopo": escopo.hashes,
                "orgao_superior_observado": escopo.proposta.COD_ORGAO_SUP,
                "criterio": "prioritarios_ms_celebrados_v2",
                "itens_consultados": len(escopo.itens),
                "escopo_oficial": escopo.model_dump(mode="json"),
            },
        )
        adicionar_captura(db, rodada)
        nova = CandidatoLegadoCaptura(
            candidato_id=registro.id,
            origem="siconv_oficial",
            confirmacao_portal="nao_consultado",
            referencia_snapshot=sha256("".join(escopo.hashes[k] for k in sorted(escopo.hashes)).encode()).hexdigest(),
            hash_conteudo=digest,
            elegivel=False,
            motivo_inelegibilidade="fora_recorte_oficial",
            fonte_captura_id=rodada.id,
            data_assinatura_siconv=escopo.convenio.DIA_ASSIN_CONV,
            data_publicacao_siconv=escopo.convenio.DIA_PUBL_CONV,
        )
        candidatos.adicionar(db, nova)
        registro.ultima_captura_id = nova.id
        registro.verificado_em = datetime.now(UTC)
        if _confirmar_transacao:
            db.commit()
        return nova.id
    except Exception:
        db.rollback()
        raise
