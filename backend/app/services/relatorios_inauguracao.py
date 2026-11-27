"""Data de Previsão/Inauguração e Status da Inauguração, por situação da linha."""

from datetime import date

from app.schemas_monitoramento import EtapasInstrumentoRead


def status_do_instrumento(etapa: EtapasInstrumentoRead) -> str | None:
    return _regra(etapa, realizada_vale=True)[1]


def inauguracao_da_linha(etapa: EtapasInstrumentoRead, situacao: str) -> tuple[date | None, str | None]:
    if situacao == "cancelado":
        return None, None
    return _regra(etapa, realizada_vale=situacao == "em_operacao")


def _regra(etapa: EtapasInstrumentoRead, *, realizada_vale: bool) -> tuple[date | None, str | None]:
    if realizada_vale:
        if etapa.modo_operacao == "dispensada":
            return None, "Dispensada"
        if etapa.modo_operacao == "pela_entrega":
            return None, "Pela entrega"
        if etapa.inauguracao:
            return etapa.inauguracao, "Realizada"
    if etapa.previsao_inauguracao:
        return etapa.previsao_inauguracao, "Prevista"
    return None, None
