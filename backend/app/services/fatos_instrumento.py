"""Fatos de entrega e inauguração compartilhados pelo Painel e pelos relatórios."""

from collections.abc import Sequence
from datetime import date

from sqlalchemy.orm import Session

from app.db.models import EventoMarco, InstrumentoEquipamento
from app.repositories import conclusoes, monitoramento
from app.repositories import etapas_instrumento as etapas
from app.schemas_monitoramento import EtapasInstrumentoRead, ModoOperacao, UnidadesEntreguesRead
from app.services.inauguracao_realizada import MARCO_PREVISAO


def datas_inauguracao(evento: EventoMarco | None) -> tuple[date | None, date | None]:
    if evento is None:
        return None, None
    # Registros antigos com os dois campos preenchidos ainda representam previsão.
    return (None, evento.data_prevista) if evento.data_prevista else (evento.data_ocorrencia, None)


def modo_operacao(
    *,
    inauguracao: date | None,
    previsao: date | None,
    dispensada: bool,
    acelerador: bool,
    resultado: str | None,
    tem_unidades: bool,
) -> ModoOperacao | None:
    if dispensada:
        return "dispensada"
    if inauguracao:
        return "inaugurada"
    if not previsao and acelerador and resultado == "integral" and tem_unidades:
        return "pela_entrega"
    return None


def carregar_etapas(
    *,
    db: Session,
    instrumentos: Sequence[InstrumentoEquipamento],
    inauguracoes: dict[int, tuple[date | None, date | None]] | None = None,
) -> list[EtapasInstrumentoRead]:
    if not instrumentos:
        return []
    ids = [i.id for i in instrumentos]
    if inauguracoes is None:
        marco = monitoramento.obter_marco_por_codigo(db, MARCO_PREVISAO)
        eventos = monitoramento.listar_eventos_por_instrumentos(db, ids, marco_ids=[marco.id]) if marco else {}
        inauguracoes = {i: datas_inauguracao(lista[0]) for i, lista in eventos.items()}
    publicacoes = etapas.publicacoes_por_numero(db, [i.nr_convenio for i in instrumentos])
    entregas = etapas.primeira_entrega_por_instrumento(db, ids)
    datas_conclusao = conclusoes.datas_conclusao_ativas(db, ids)
    dispensadas = etapas.ids_com_inauguracao_dispensada(db, ids)
    resultados = etapas.resultado_conclusao_por_instrumento(db, ids)
    unidades = etapas.unidades_entregues_por_data(db, ids)
    aceleradores = etapas.ids_com_acelerador_linear(db, ids)
    registros = []
    for instrumento in instrumentos:
        i = instrumento.id
        inauguracao, previsao = inauguracoes.get(i, (None, None))
        unidades_do_instrumento = unidades.get(i, [])
        registros.append(
            EtapasInstrumentoRead(
                nr_convenio=instrumento.nr_convenio,
                publicacao=publicacoes.get(instrumento.nr_convenio),
                entrega=entregas.get(i),
                inauguracao=inauguracao,
                previsao_inauguracao=previsao,
                conclusao=datas_conclusao.get(i),
                inauguracao_dispensada=i in dispensadas,
                conclusao_resultado=resultados.get(i),
                tem_acelerador_linear=i in aceleradores,
                unidades_entregues=[UnidadesEntreguesRead(data=d, quantidade=q) for d, q in unidades_do_instrumento],
                modo_operacao=modo_operacao(
                    inauguracao=inauguracao,
                    previsao=previsao,
                    dispensada=i in dispensadas,
                    acelerador=i in aceleradores,
                    resultado=resultados.get(i),
                    tem_unidades=bool(unidades_do_instrumento),
                ),
            )
        )
    return registros
