"""Casos de uso de cadastro/eventos/ações de instrumentos monitorados --
extraído de `app/routers/monitoramento.py` (Plan Mode segurança
2026-09-16, Bloco 3): a lógica de negócio (e a checagem de autorização,
`assert_pode_editar_monitoramento`) mora aqui, não só no `Depends` do
router -- protege contra qualquer chamada que não passe pelo HTTP (script,
outro service, job futuro). Comportamento idêntico ao que estava inline no
router antes desta extração; nada muda do ponto de vista da API.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_monitoramento
from app.db.models import (
    AcaoMonitoramento,
    CnesEstabelecimento,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    Notificacao,
    NotificacaoTipo,
    User,
)


def _compor_observacao(autor_nome: str, observacao: str | None) -> str:
    """Autoria autenticada fica visivel junto do texto para leitura rapida."""
    prefixo = f"[{autor_nome}]"
    return f"{prefixo} {observacao}" if observacao else prefixo


@dataclass(frozen=True)
class DadosEquipamentoEntregue:
    marca: str | None = None
    modelo: str | None = None
    numero_serie: str | None = None
    vida_util_anos: int | None = None


def _resumo_equipamento_entregue(dados: DadosEquipamentoEntregue) -> str | None:
    """Resumo textual do equipamento fisico informado junto do evento de
    entrega -- vira parte da observacao (retrato historico do que foi
    confirmado NAQUELE lancamento, mesmo que o cadastro mude depois). None
    quando nenhum dos 4 campos veio preenchido."""
    partes = []
    if dados.marca or dados.modelo:
        partes.append(f"{dados.marca or ''} {dados.modelo or ''}".strip())
    if dados.numero_serie:
        partes.append(f"Nº série {dados.numero_serie}")
    if dados.vida_util_anos is not None:
        partes.append(f"Vida útil {dados.vida_util_anos} ano(s)")
    if not partes:
        return None
    return "Equipamento entregue: " + " · ".join(partes)


def atualizar_cadastro_instrumento(
    *,
    nr_convenio: str,
    alteracoes_brutas: dict[str, object | None],
    db: Session,
    usuario: User,
) -> InstrumentoEquipamento:
    """Único jeito de editar `InstrumentoEquipamento` (fora de script) -- só
    aplica campo que veio preenchido (`alteracoes_brutas` já vem filtrado
    por `exclude_unset` no router), nunca zera um campo existente por causa
    de um PATCH parcial."""
    assert_pode_editar_monitoramento(usuario)
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")

    cnes_novo = alteracoes_brutas.get("cnes")
    if cnes_novo is not None and db.get(CnesEstabelecimento, cnes_novo.zfill(7)) is None:
        raise HTTPException(422, f"CNES {cnes_novo} não encontrado na base de referência (CnesEstabelecimento).")

    alteracoes: dict[str, dict[str, object | None]] = {}
    for campo, valor in alteracoes_brutas.items():
        antigo = getattr(instrumento, campo)
        if antigo != valor:
            alteracoes[campo] = {"old": antigo, "new": valor}
        setattr(instrumento, campo, valor)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action="updated",
        details={"nr_convenio": nr_convenio, "changes": alteracoes},
    )
    # Notificacao camada 2 (Radar de Convenios, 2026-09-15) -- edicao manual
    # do tecnico, so quando algo realmente mudou (alteracoes vazio = PATCH
    # com corpo igual ao que ja estava, nao e novidade pra ninguem).
    if alteracoes:
        db.add(Notificacao(
            tipo=NotificacaoTipo.edicao_manual,
            titulo=f"{usuario.name} editou o convênio {nr_convenio}",
            corpo=f"Campo(s) alterado(s): {', '.join(alteracoes.keys())}",
            entidade_id=instrumento.id,
        ))
    return instrumento


@dataclass(frozen=True)
class NovoEventoMonitorado:
    marco_id: int
    data_ocorrencia: date | None = None
    data_prevista: date | None = None
    status_regulatorio: str | None = None
    numero_documento: str | None = None
    data_validade: date | None = None
    observacao: str | None = None
    equipamento: DadosEquipamentoEntregue = DadosEquipamentoEntregue()


def registrar_evento_monitorado(
    *,
    nr_convenio: str,
    dados: NovoEventoMonitorado,
    db: Session,
    usuario: User,
) -> EventoMarco:
    """Append-only -- sempre INSERT, nunca UPDATE (ver comentario em
    EventoMarco no models.py). Corrigir um lançamento errado é lançar um
    evento novo."""
    assert_pode_editar_monitoramento(usuario)
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")
    marco = db.get(MarcoCatalogo, dados.marco_id)
    if marco is None:
        raise HTTPException(422, f"Marco {dados.marco_id} não existe no catálogo.")

    observacao = dados.observacao
    # Equipamento FISICO so se aplica ao marco de entrega (achado
    # 2026-09-09, "o equipamento entregue pode mover para eventos") --
    # atualiza o estado atual do instrumento E deixa retrato no proprio
    # evento, via observacao.
    if marco.codigo == "cronograma_entrega":
        if dados.equipamento.marca is not None:
            instrumento.equipamento_marca = dados.equipamento.marca
        if dados.equipamento.modelo is not None:
            instrumento.equipamento_modelo = dados.equipamento.modelo
        if dados.equipamento.numero_serie is not None:
            instrumento.equipamento_numero_serie = dados.equipamento.numero_serie
        if dados.equipamento.vida_util_anos is not None:
            instrumento.equipamento_vida_util_anos = dados.equipamento.vida_util_anos
        resumo_equipamento = _resumo_equipamento_entregue(dados.equipamento)
        if resumo_equipamento:
            observacao = f"{observacao}. {resumo_equipamento}" if observacao else resumo_equipamento

    evento = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=dados.marco_id,
        data_ocorrencia=dados.data_ocorrencia,
        data_prevista=dados.data_prevista,
        status_regulatorio=dados.status_regulatorio,
        numero_documento=dados.numero_documento,
        data_validade=dados.data_validade,
        observacao=_compor_observacao(usuario.name, observacao),
        autor_id=usuario.id,
    )
    db.add(evento)
    db.flush()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=evento.id,
        action="created",
        details={"nr_convenio": nr_convenio, "marco_id": dados.marco_id},
    )
    return evento


def registrar_acao_monitorada(
    *,
    nr_convenio: str,
    descricao: str,
    data_prevista: date | None,
    responsavel: str | None,
    db: Session,
    usuario: User,
) -> AcaoMonitoramento:
    """Cria uma acao PENDENTE (data_conclusao null) -- diferente de
    EventoMarco, essa tabela nao esta amarrada a um catalogo fixo de
    marcos (ver docstring de AcaoMonitoramento no models.py)."""
    assert_pode_editar_monitoramento(usuario)
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")

    acao = AcaoMonitoramento(
        instrumento_id=instrumento.id, descricao=descricao,
        data_prevista=data_prevista, responsavel=responsavel,
    )
    db.add(acao)
    db.flush()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=acao.id,
        action="created",
        details={"nr_convenio": nr_convenio, "responsavel": responsavel},
    )
    return acao


def concluir_acao_monitorada(*, acao_id: int, db: Session, usuario: User) -> AcaoMonitoramento:
    """Unico UPDATE que AcaoMonitoramento permite de proposito -- marcar
    como concluida (seta data_conclusao = hoje). Descricao/data_prevista/
    responsavel continuam imutaveis (ver docstring do model)."""
    assert_pode_editar_monitoramento(usuario)
    acao = db.get(AcaoMonitoramento, acao_id)
    if acao is None:
        raise HTTPException(404, f"Ação {acao_id} não encontrada.")
    if acao.data_conclusao is None:
        acao.data_conclusao = date.today()
        log_action(
            db,
            user_id=usuario.id,
            entity_name="acao_monitoramento",
            entity_id=acao.id,
            action="completed",
            details={"old": None, "new": acao.data_conclusao.isoformat()},
        )
    return acao
