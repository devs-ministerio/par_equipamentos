"""Verificação pura da prova; não aprova, não consulta fonte nem grava SQL."""

import json
import re
from datetime import datetime, timedelta
from hashlib import sha256
from hmac import compare_digest

from app.domain_errors import ConflictError
from app.equipamentos import descricao_de_obra_ou_servico
from app.schemas_celebracao_legado import ConvenioCelebracaoSiconv
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao
from app.services.criterios_descoberta import CODIGO_MS, componente_prioritario, equipamentos_prioritarios_do_item
from app.services.descoberta_legado import CandidatoLegado

VALIDADE_RECAPTURA = timedelta(hours=24)


def hash_captura_promocao(captura: CapturaLegadoParaPromocao) -> str:
    # Chaves de objetos ordenadas; listas e campos oficiais não são descartados.
    serializado = json.dumps(captura.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return sha256(serializado.encode()).hexdigest()


def validar_frescor_recaptura(*, capturado_em: datetime, agora: datetime) -> None:
    """Ambos horários vêm do servidor/banco, nunca do pedido do navegador."""
    if any(d.tzinfo is None or d.utcoffset() is None for d in (capturado_em, agora)):
        raise ConflictError("Não foi possível verificar o horário da evidência oficial.")
    idade = agora - capturado_em
    if idade < timedelta(0) or idade > VALIDADE_RECAPTURA:
        raise ConflictError("A evidência oficial expirou ou possui horário inválido. Realize nova consulta.")


def validar_captura_promocao(
    *, candidato: CandidatoLegado, captura: CapturaLegadoParaPromocao, hash_revisado: str
) -> None:
    if not re.fullmatch(r"[a-f0-9]{64}", hash_revisado) or not compare_digest(
        hash_captura_promocao(captura), hash_revisado
    ):
        raise ConflictError("A evidência oficial mudou desde a revisão.")
    if captura.convenio.NR_CONVENIO != candidato.numero or captura.convenio.ID_PROPOSTA != candidato.id_proposta:
        raise ConflictError("A recaptura oficial não corresponde ao candidato revisado.")
    celebracao = ConvenioCelebracaoSiconv.model_validate(captura.convenio.model_dump())
    if not celebracao.celebrado or candidato.criterio_escopo != "prioritarios_ms_celebrados_v2":
        raise ConflictError("A prova revisada não confirma convênio celebrado no escopo vigente.")
    if candidato.orgao_superior != CODIGO_MS or captura.proposta.COD_ORGAO_SUP != CODIGO_MS:
        raise ConflictError("A recaptura não confirma o Ministério da Saúde.")
    if candidato.confirmacao_portal != "confirmado" or candidato.data_publicacao != captura.portal.dataPublicacao:
        raise ConflictError("A confirmação oficial do Portal mudou desde a descoberta.")
    if (celebracao.DIA_ASSIN_CONV, celebracao.DIA_PUBL_CONV) != (
        candidato.data_assinatura_siconv,
        candidato.data_publicacao_siconv,
    ):
        raise ConflictError("As datas oficiais de celebração mudaram desde a descoberta.")
    atuais = {
        (item.ID_ITEM_PAD, codigo)
        for item in captura.itens
        for codigo in equipamentos_prioritarios_do_item(item.DESCRICAO_ITEM)
    }
    revisados = {(e.id_item, e.codigo_equipamento) for e in candidato.evidencias}
    if captura.itens and not atuais and all(descricao_de_obra_ou_servico(i.DESCRICAO_ITEM) for i in captura.itens):
        raise ConflictError("Obra ou serviço não comprova aquisição de equipamento para entrada na carteira.")
    componentes = {
        (p.ID_PROGRAMA, p.NOME_PROGRAMA, nome)
        for p in captura.programas.catalogo
        if (p.model_extra or {}).get("COD_ORGAO_SUP_PROGRAMA") == CODIGO_MS
        and (nome := componente_prioritario(p.NOME_PROGRAMA)) is not None
    }
    componentes_revisados = {(c.id_programa, c.nome_programa, c.componente) for c in candidato.componentes}
    if atuais != revisados or componentes != componentes_revisados or not (atuais or componentes):
        raise ConflictError("A evidência prioritária mudou ou está fora do escopo. Revise novamente o candidato.")
