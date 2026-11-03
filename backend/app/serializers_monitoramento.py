"""Conversão de entidades de monitoramento em schemas de resposta (sem acesso a banco)."""

from __future__ import annotations

from app.db.models import (
    AcaoMonitoramento,
    EventoMarco,
)
from app.pipeline import portal_transparencia
from app.schemas_monitoramento_api import (
    AcaoMonitoramentoRead,
    EventoMarcoRead,
    ValorSituacaoAoVivoRead,
)


def _ao_vivo_de(
    dado: portal_transparencia.ConvenioPortalTransparencia | dict | None,
) -> ValorSituacaoAoVivoRead:
    """Monta o `ao_vivo` a partir da resposta crua do Portal da Transparencia
    (ou `None` quando a consulta falhou/nao achou). Extraida do endpoint pra
    dar pra testar a deteccao de `valor_suspeito` sem precisar de banco nem
    de rede (ver test_monitoramento.py)."""
    if dado is None:
        return ValorSituacaoAoVivoRead(disponivel=False)

    if isinstance(dado, dict):
        dado = portal_transparencia.ConvenioPortalTransparencia.model_validate(dado)

    valor = dado.valor
    valor_liberado = dado.valorLiberado
    suspeito = valor is not None and valor_liberado is not None and valor_liberado > valor
    return ValorSituacaoAoVivoRead(
        disponivel=True,
        valor=valor,
        valor_liberado=valor_liberado,
        situacao=dado.situacao,
        valor_suspeito=suspeito,
    )


def _compor_observacao(autor_nome: str, observacao: str | None) -> str:
    """Autoria autenticada fica visivel junto do texto para leitura rapida."""
    prefixo = f"[{autor_nome}]"
    return f"{prefixo} {observacao}" if observacao else prefixo


def _evento_read(evento: EventoMarco, nomes: dict[int, str]) -> EventoMarcoRead:
    """Monta EventoMarcoRead resolvendo autor/exclusão a partir do mapa de
    nomes já carregado (evita N+1 query por evento, ver
    `monitoramento_repo.resolver_nomes_usuarios`)."""
    return EventoMarcoRead(
        id=evento.id,
        marco_id=evento.marco_id,
        fase_geral_id=evento.fase_geral_id,
        data_ocorrencia=evento.data_ocorrencia,
        data_prevista=evento.data_prevista,
        status_regulatorio=evento.status_regulatorio,
        numero_documento=evento.numero_documento,
        data_validade=evento.data_validade,
        observacao=evento.observacao,
        autor_nome=nomes.get(evento.autor_id) if evento.autor_id else None,
        created_at=evento.created_at,
        atualizado_em=evento.atualizado_em,
        substituido_por_id=evento.substituido_por_id,
        deletado_em=evento.deletado_em,
        deletado_por_nome=nomes.get(evento.deletado_por_id) if evento.deletado_por_id else None,
        motivo_exclusao=evento.motivo_exclusao,
        ativo=evento.deletado_em is None and evento.substituido_por_id is None,
    )


def _acao_read(acao: AcaoMonitoramento, nr_convenio: str, nomes: dict[int, str]) -> AcaoMonitoramentoRead:
    return AcaoMonitoramentoRead(
        id=acao.id,
        instrumento_id=acao.instrumento_id,
        nr_convenio=nr_convenio,
        descricao=acao.descricao,
        data_prevista=acao.data_prevista,
        data_conclusao=acao.data_conclusao,
        responsavel=acao.responsavel,
        responsavel_id=acao.responsavel_id,
        responsavel_nome=nomes.get(acao.responsavel_id) if acao.responsavel_id else None,
        criado_por_nome=nomes.get(acao.criado_por_id) if acao.criado_por_id else None,
        created_at=acao.created_at,
        atualizado_em=acao.atualizado_em,
        substituido_por_id=acao.substituido_por_id,
        deletado_em=acao.deletado_em,
        deletado_por_nome=nomes.get(acao.deletado_por_id) if acao.deletado_por_id else None,
        motivo_exclusao=acao.motivo_exclusao,
        ativo=acao.deletado_em is None and acao.substituido_por_id is None,
    )
