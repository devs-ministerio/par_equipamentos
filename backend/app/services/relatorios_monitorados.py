"""Recorte e linhas compartilhados pela prévia e pelas exportações do monitoramento."""

from dataclasses import replace
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session

from app.domain_errors import ValidationError
from app.repositories.limites_relatorio import LimiteConsultaExcedido
from app.services.fase_acompanhamento import FaseAcompanhamento
from app.services.fatos_instrumento import carregar_etapas
from app.services.relatorios_equipamentos_modelo import montar_equipamentos
from app.services.relatorios_equipamentos_resumo import SituacaoEquipamento as SituacaoEquipamento
from app.services.relatorios_filtro import FiltroRelatorio, Nivel
from app.services.relatorios_instrumentos_modelo import montar_instrumentos
from app.services.relatorios_modelo import Celula, RelatorioMonitorado  # noqa: F401
from app.services.relatorios_propostas_modelo import montar_propostas
from app.services.relatorios_recorte import _instrumentos

TipoMonitorado = Literal["equipamentos_monitorados", "instrumentos_monitorados", "propostas"]


def montar_relatorio_monitorado(
    *,
    db: Session,
    tipo: TipoMonitorado,
    nivel: Nivel,
    filtro: FiltroRelatorio,
    situacoes: tuple[SituacaoEquipamento, ...] = (),
    fases: tuple[FaseAcompanhamento, ...] = (),
) -> RelatorioMonitorado:
    try:
        return _montar(db, tipo, nivel, filtro, situacoes, fases)
    except LimiteConsultaExcedido as exc:
        raise ValidationError("O recorte excede o limite seguro. Refine os filtros e tente novamente.") from exc


def _montar(
    db: Session,
    tipo: TipoMonitorado,
    nivel: Nivel,
    filtro: FiltroRelatorio,
    situacoes: tuple[SituacaoEquipamento, ...],
    fases: tuple[FaseAcompanhamento, ...],
) -> RelatorioMonitorado:
    completo = nivel == "completo"
    referencia = date.today()
    if tipo == "propostas":
        return montar_propostas(db=db, filtro=filtro, completo=completo, referencia=referencia)
    equipamentos = tipo == "equipamentos_monitorados"
    candidatos = _instrumentos(
        db,
        replace(
            filtro,
            ano_inicio=None,
            ano_fim=None,
            equipamento=None if equipamentos else filtro.equipamento,
            situacao_origem="monitoramento",
        ),
    )
    ano_inicio, ano_fim = filtro.ano_inicio, filtro.ano_fim
    fases_selecionadas = {fase.value for fase in fases} if not equipamentos else set()
    recorte = [
        i
        for i in candidatos
        if (not fases_selecionadas or i.fase_atual in fases_selecionadas)
        and (
            ano_inicio is None
            or (
                i.instrumento.ano_instrumento is not None
                and ano_fim is not None
                and ano_inicio <= i.instrumento.ano_instrumento <= ano_fim
            )
        )
    ]
    instrumentos = [i.instrumento for i in recorte]
    etapas = {e.nr_convenio: e for e in carregar_etapas(db=db, instrumentos=instrumentos)}
    if not equipamentos:
        return montar_instrumentos(
            db=db, recorte=recorte, etapas=etapas, filtro=filtro,
            fases=tuple(dict.fromkeys(f.value for f in fases)), completo=completo, referencia=referencia,
        )

    return montar_equipamentos(
        db=db,
        recorte=recorte,
        etapas=etapas,
        filtro=filtro,
        situacoes=situacoes,
        completo=completo,
        referencia=referencia,
    )
