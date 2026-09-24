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
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_monitoramento
from app.db.models import (
    AcaoMonitoramento,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    MarcoGrupo,
    Notificacao,
    NotificacaoTipo,
    User,
)
from app.domain_errors import NotFoundError, ValidationError
from app.repositories import monitoramento as monitoramento_repo

# Mesmo dicionário fechado do CHECK constraint em models.py -- validado
# aqui também pra devolver 422 limpo em vez do IntegrityError cru do
# Postgres (Plan Mode monitoramento-evolucao 2026-09-19).
_TIPOLOGIAS_VALIDAS = {"A", "CV", "C", "EO", "C.B", "NA"}
_MODALIDADES_ONCO_VALIDAS = {"Apoio", "Diagnóstico", "Rastreamento", "Tratamento", "Múltiplas"}


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


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
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")

    cnes_novo = alteracoes_brutas.get("cnes")
    if cnes_novo is not None and (
        not isinstance(cnes_novo, str) or monitoramento_repo.obter_cnes_por_codigo(db, cnes_novo.zfill(7)) is None
    ):
        raise ValidationError(f"CNES {cnes_novo} não encontrado na base de referência (CnesEstabelecimento).")

    tipologia_nova = alteracoes_brutas.get("tipologia")
    if tipologia_nova is not None and tipologia_nova not in _TIPOLOGIAS_VALIDAS:
        raise ValidationError(f"Tipologia {tipologia_nova!r} inválida. Use uma de {sorted(_TIPOLOGIAS_VALIDAS)}.")
    modalidade_nova = alteracoes_brutas.get("modalidade_onco")
    if modalidade_nova is not None and modalidade_nova not in _MODALIDADES_ONCO_VALIDAS:
        raise ValidationError(
            f"Modalidade {modalidade_nova!r} inválida. Use uma de {sorted(_MODALIDADES_ONCO_VALIDAS)}."
        )

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
        monitoramento_repo.adicionar_notificacao(
            db,
            Notificacao(
                tipo=NotificacaoTipo.edicao_manual,
                titulo=f"{usuario.name} editou o convênio {nr_convenio}",
                corpo=f"Campo(s) alterado(s): {', '.join(alteracoes.keys())}",
                entidade_id=instrumento.id,
            ),
        )
    db.commit()
    db.refresh(instrumento)
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
    # Obrigatório quando `marco.grupo != fase_geral` (Plan Mode
    # monitoramento-evolucao 2026-09-19) -- amarra o marco de cronograma
    # físico/regulatório à fase geral que ele pertence. Ignorado quando o
    # próprio marco JÁ é de grupo=fase_geral.
    fase_geral_id: int | None = None
    confirmar_inauguracao: bool = False


def _validar_fase_geral_id(db: Session, marco: MarcoCatalogo, fase_geral_id: int | None) -> int | None:
    if marco.grupo == MarcoGrupo.fase_geral:
        return None
    if fase_geral_id is None:
        raise ValidationError("Indique a fase geral correspondente a este marco de cronograma físico/regulatório.")
    fase = monitoramento_repo.obter_marco_por_id(db, fase_geral_id)
    if fase is None or fase.grupo != MarcoGrupo.fase_geral:
        raise ValidationError(f"fase_geral_id {fase_geral_id} não corresponde a um marco de fase geral válido.")
    return fase_geral_id


def _validar_dados_novo_evento(marco: MarcoCatalogo, dados: NovoEventoMonitorado) -> None:
    if marco.grupo == MarcoGrupo.fase_geral and dados.data_prevista is not None:
        raise ValidationError("Marco de fase geral não aceita data prevista; informe somente a data de ocorrência.")
    if dados.data_ocorrencia and dados.data_ocorrencia > date.today():
        raise ValidationError("A data realizada não pode estar no futuro. Atualize-a para a data real da ocorrência.")
    if marco.codigo != "fase_concluido":
        return
    if dados.data_ocorrencia is None:
        raise ValidationError("Informe a data de ocorrência para concluir o instrumento.")
    if not dados.confirmar_inauguracao:
        raise ValidationError("Confirme a inauguração na data de conclusão antes de registrar o evento.")


def _aplicar_dados_equipamento_entregue(
    instrumento: InstrumentoEquipamento, marco: MarcoCatalogo, dados: NovoEventoMonitorado
) -> str | None:
    observacao = dados.observacao
    if marco.codigo != "cronograma_entrega":
        return observacao
    equipamento = dados.equipamento
    if equipamento.marca is not None:
        instrumento.equipamento_marca = equipamento.marca
    if equipamento.modelo is not None:
        instrumento.equipamento_modelo = equipamento.modelo
    if equipamento.numero_serie is not None:
        instrumento.equipamento_numero_serie = equipamento.numero_serie
    if equipamento.vida_util_anos is not None:
        instrumento.equipamento_vida_util_anos = equipamento.vida_util_anos
    resumo = _resumo_equipamento_entregue(equipamento)
    return f"{observacao}. {resumo}" if observacao and resumo else resumo or observacao


def _registrar_inauguracao_confirmada(
    *,
    db: Session,
    instrumento: InstrumentoEquipamento,
    marco: MarcoCatalogo,
    dados: NovoEventoMonitorado,
    usuario: User,
    nr_convenio: str,
) -> tuple[int | None, date | None]:
    if marco.codigo != "fase_concluido":
        return None, None
    marco_inauguracao = monitoramento_repo.obter_marco_por_codigo(db, "cronograma_previsao_inauguracao")
    if marco_inauguracao is None:
        raise ValidationError("Marco de previsão de inauguração não encontrado no catálogo.")
    anterior = monitoramento_repo.obter_evento_mais_recente_do_marco(
        db, instrumento_id=instrumento.id, marco_id=marco_inauguracao.id
    )
    if anterior and anterior.data_ocorrencia is not None:
        raise ValidationError("Já existe uma inauguração realizada para este instrumento.")
    previsao_anterior = anterior.data_prevista if anterior else None
    inauguracao = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=marco_inauguracao.id,
        fase_geral_id=marco.id,
        data_ocorrencia=dados.data_ocorrencia,
        observacao=_compor_observacao(usuario.name, "Inauguração confirmada ao concluir o instrumento."),
        autor_id=usuario.id,
    )
    monitoramento_repo.adicionar_evento(db, inauguracao)
    if anterior is not None:
        anterior.substituido_por_id = inauguracao.id
        anterior.atualizado_em = _agora_utc()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=inauguracao.id,
        action="created",
        details={
            "nr_convenio": nr_convenio,
            "marco_id": marco_inauguracao.id,
            "data_prevista_anterior": previsao_anterior.isoformat() if previsao_anterior else None,
            "data_ocorrencia": dados.data_ocorrencia.isoformat() if dados.data_ocorrencia else None,
            "confirmada_com_conclusao": True,
        },
    )
    return inauguracao.id, previsao_anterior


def registrar_evento_monitorado(
    *,
    nr_convenio: str,
    dados: NovoEventoMonitorado,
    db: Session,
    usuario: User,
) -> EventoMarco:
    """Append-only -- sempre INSERT, nunca UPDATE (ver comentario em
    EventoMarco no models.py). Corrigir um lançamento errado é lançar um
    evento novo (ver `editar_evento_monitorado`)."""
    assert_pode_editar_monitoramento(usuario)
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    marco = monitoramento_repo.obter_marco_por_id(db, dados.marco_id)
    if marco is None:
        raise ValidationError(f"Marco {dados.marco_id} não existe no catálogo.")
    fase_geral_id = _validar_fase_geral_id(db, marco, dados.fase_geral_id)

    _validar_dados_novo_evento(marco, dados)

    evento_anterior = monitoramento_repo.obter_evento_mais_recente_do_marco(
        db, instrumento_id=instrumento.id, marco_id=dados.marco_id
    )
    reprogramou = bool(
        dados.data_prevista
        and evento_anterior
        and evento_anterior.data_prevista
        and dados.data_prevista != evento_anterior.data_prevista
    )
    if reprogramou and not (dados.observacao or "").strip():
        raise ValidationError("Informe a justificativa para alterar a data prevista.")

    observacao = _aplicar_dados_equipamento_entregue(instrumento, marco, dados)

    evento = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=dados.marco_id,
        fase_geral_id=fase_geral_id,
        data_ocorrencia=dados.data_ocorrencia,
        data_prevista=dados.data_prevista,
        status_regulatorio=dados.status_regulatorio,
        numero_documento=dados.numero_documento,
        data_validade=dados.data_validade,
        observacao=_compor_observacao(usuario.name, observacao),
        autor_id=usuario.id,
    )
    monitoramento_repo.adicionar_evento(db, evento)
    inauguracao_id, _ = _registrar_inauguracao_confirmada(
        db=db, instrumento=instrumento, marco=marco, dados=dados, usuario=usuario, nr_convenio=nr_convenio
    )
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=evento.id,
        action="created",
        details={
            "nr_convenio": nr_convenio,
            "marco_id": dados.marco_id,
            "data_prevista_anterior": evento_anterior.data_prevista.isoformat()
            if reprogramou and evento_anterior and evento_anterior.data_prevista
            else None,
            "data_prevista_nova": dados.data_prevista.isoformat() if dados.data_prevista else None,
            "data_ocorrencia": dados.data_ocorrencia.isoformat() if dados.data_ocorrencia else None,
            "reprogramacao": reprogramou,
            "inauguracao_confirmada": inauguracao_id is not None,
            "evento_inauguracao_id": inauguracao_id,
        },
    )
    db.commit()
    db.refresh(evento)
    return evento


def _resumo_evento(evento: EventoMarco) -> dict[str, object | None]:
    return {
        "data_ocorrencia": evento.data_ocorrencia.isoformat() if evento.data_ocorrencia else None,
        "data_prevista": evento.data_prevista.isoformat() if evento.data_prevista else None,
        "status_regulatorio": evento.status_regulatorio,
        "numero_documento": evento.numero_documento,
        "data_validade": evento.data_validade.isoformat() if evento.data_validade else None,
        "observacao": evento.observacao,
    }


def editar_evento_monitorado(
    *,
    evento_id: int,
    dados: NovoEventoMonitorado,
    db: Session,
    usuario: User,
) -> EventoMarco:
    """ "Editar" continua append-only (decisão do usuário, Plan Mode
    monitoramento-evolucao 2026-09-19): lança um evento novo corrigido e
    aponta o antigo pra ele via `substituido_por_id` -- nunca UPDATE nos
    campos do lançamento original. Marco/instrumento do evento não mudam
    numa correção (isso seria excluir + criar de novo, não "editar")."""
    assert_pode_editar_monitoramento(usuario)
    antigo = monitoramento_repo.obter_evento_por_id(db, evento_id)
    if antigo is None:
        raise NotFoundError(f"Evento {evento_id} não encontrado.")
    if antigo.deletado_em is not None or antigo.substituido_por_id is not None:
        raise ValidationError(f"Evento {evento_id} já foi excluído ou corrigido -- não pode editar de novo.")

    marco = monitoramento_repo.obter_marco_por_id(db, antigo.marco_id)
    if marco is None:
        raise NotFoundError(f"Marco {antigo.marco_id} não existe mais no catálogo.")
    fase_geral_id = _validar_fase_geral_id(db, marco, dados.fase_geral_id)
    if marco.grupo == MarcoGrupo.fase_geral and dados.data_prevista is not None:
        raise ValidationError("Marco de fase geral não aceita data prevista; informe somente a data de ocorrência.")
    if dados.data_ocorrencia and dados.data_ocorrencia > date.today():
        raise ValidationError("A data realizada não pode estar no futuro.")

    novo = EventoMarco(
        instrumento_id=antigo.instrumento_id,
        marco_id=antigo.marco_id,
        fase_geral_id=fase_geral_id,
        data_ocorrencia=dados.data_ocorrencia,
        data_prevista=dados.data_prevista,
        status_regulatorio=dados.status_regulatorio,
        numero_documento=dados.numero_documento,
        data_validade=dados.data_validade,
        observacao=_compor_observacao(usuario.name, dados.observacao),
        autor_id=usuario.id,
    )
    monitoramento_repo.adicionar_evento(db, novo)
    antigo.substituido_por_id = novo.id
    antigo.atualizado_em = _agora_utc()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=novo.id,
        action="updated",
        details={"evento_original_id": evento_id, "old": _resumo_evento(antigo), "new": _resumo_evento(novo)},
    )
    db.commit()
    db.refresh(novo)
    return novo


def excluir_evento_monitorado(*, evento_id: int, motivo: str, db: Session, usuario: User) -> EventoMarco:
    """Exclusão lógica -- `deletado_em`/`deletado_por_id`/`motivo_exclusao`,
    nunca DELETE físico (ver docstring de EventoMarco). Evento excluído sai
    do cálculo de fase/timeline mas continua recuperável/auditável."""
    assert_pode_editar_monitoramento(usuario)
    evento = monitoramento_repo.obter_evento_por_id(db, evento_id)
    if evento is None:
        raise NotFoundError(f"Evento {evento_id} não encontrado.")
    if evento.deletado_em is not None:
        raise ValidationError(f"Evento {evento_id} já está excluído.")
    if not motivo.strip():
        raise ValidationError("Informe o motivo da exclusão.")

    evento.deletado_em = _agora_utc()
    evento.deletado_por_id = usuario.id
    evento.motivo_exclusao = motivo
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=evento.id,
        action="deleted",
        details={"motivo": motivo},
    )
    # O chamador pode recalcular a fase ainda nesta mesma transação. Garante
    # que a exclusão lógica já participe das queries seguintes, sem depender
    # de um autoflush implícito do SQLAlchemy.
    monitoramento_repo.sincronizar(db)
    db.commit()
    db.refresh(evento)
    return evento


def registrar_acao_monitorada(
    *,
    nr_convenio: str,
    descricao: str,
    data_prevista: date | None,
    responsavel: str | None,
    db: Session,
    usuario: User,
    responsavel_id: int | None = None,
) -> AcaoMonitoramento:
    """Cria uma acao PENDENTE (data_conclusao null) -- diferente de
    EventoMarco, essa tabela nao esta amarrada a um catalogo fixo de
    marcos (ver docstring de AcaoMonitoramento no models.py).
    `criado_por_id` (marcador de responsável pedido no Plan Mode
    monitoramento-evolucao 2026-09-19) vem sempre do usuário autenticado,
    nunca do cliente."""
    assert_pode_editar_monitoramento(usuario)
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")

    acao = AcaoMonitoramento(
        instrumento_id=instrumento.id,
        descricao=descricao,
        data_prevista=data_prevista,
        responsavel=responsavel,
        responsavel_id=responsavel_id,
        criado_por_id=usuario.id,
    )
    monitoramento_repo.adicionar_acao(db, acao)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=acao.id,
        action="created",
        details={"nr_convenio": nr_convenio, "responsavel": responsavel, "responsavel_id": responsavel_id},
    )
    db.commit()
    db.refresh(acao)
    return acao


def _resumo_acao(acao: AcaoMonitoramento) -> dict[str, object | None]:
    return {
        "descricao": acao.descricao,
        "data_prevista": acao.data_prevista.isoformat() if acao.data_prevista else None,
        "responsavel": acao.responsavel,
        "responsavel_id": acao.responsavel_id,
    }


def editar_acao_monitorada(
    *,
    acao_id: int,
    descricao: str,
    data_prevista: date | None,
    responsavel: str | None,
    responsavel_id: int | None,
    db: Session,
    usuario: User,
) -> AcaoMonitoramento:
    """Mesma disciplina append-only de `editar_evento_monitorado` -- corrige
    lançando uma ação nova e aponta a antiga pra ela via
    `substituido_por_id`. `data_conclusao` de uma ação pendente não migra
    pra correção (a correção nasce pendente de novo; concluir é ato
    separado, ver `concluir_acao_monitorada`)."""
    assert_pode_editar_monitoramento(usuario)
    antiga = monitoramento_repo.obter_acao_por_id(db, acao_id)
    if antiga is None:
        raise NotFoundError(f"Ação {acao_id} não encontrada.")
    if antiga.deletado_em is not None or antiga.substituido_por_id is not None:
        raise ValidationError(f"Ação {acao_id} já foi excluída ou corrigida -- não pode editar de novo.")

    nova = AcaoMonitoramento(
        instrumento_id=antiga.instrumento_id,
        descricao=descricao,
        data_prevista=data_prevista,
        responsavel=responsavel,
        responsavel_id=responsavel_id,
        criado_por_id=usuario.id,
    )
    monitoramento_repo.adicionar_acao(db, nova)
    antiga.substituido_por_id = nova.id
    antiga.atualizado_em = _agora_utc()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=nova.id,
        action="updated",
        details={"acao_original_id": acao_id, "old": _resumo_acao(antiga), "new": _resumo_acao(nova)},
    )
    db.commit()
    db.refresh(nova)
    return nova


def excluir_acao_monitorada(*, acao_id: int, motivo: str, db: Session, usuario: User) -> AcaoMonitoramento:
    """Exclusão lógica -- ver docstring de `excluir_evento_monitorado`,
    mesma disciplina."""
    assert_pode_editar_monitoramento(usuario)
    acao = monitoramento_repo.obter_acao_por_id(db, acao_id)
    if acao is None:
        raise NotFoundError(f"Ação {acao_id} não encontrada.")
    if acao.deletado_em is not None:
        raise ValidationError(f"Ação {acao_id} já está excluída.")
    if not motivo.strip():
        raise ValidationError("Informe o motivo da exclusão.")

    acao.deletado_em = _agora_utc()
    acao.deletado_por_id = usuario.id
    acao.motivo_exclusao = motivo
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=acao.id,
        action="deleted",
        details={"motivo": motivo},
    )
    db.commit()
    db.refresh(acao)
    return acao


def concluir_acao_monitorada(*, acao_id: int, db: Session, usuario: User) -> AcaoMonitoramento:
    """Unico UPDATE que AcaoMonitoramento permite de proposito -- marcar
    como concluida (seta data_conclusao = hoje). Descricao/data_prevista/
    responsavel continuam imutaveis (ver docstring do model)."""
    assert_pode_editar_monitoramento(usuario)
    acao = monitoramento_repo.obter_acao_por_id(db, acao_id)
    if acao is None:
        raise NotFoundError(f"Ação {acao_id} não encontrada.")
    if acao.deletado_em is not None or acao.substituido_por_id is not None:
        raise ValidationError(f"Ação {acao_id} já foi excluída ou corrigida -- não pode concluir.")
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
    db.commit()
    db.refresh(acao)
    return acao


def obter_nr_convenio_da_acao_monitorada(*, acao: AcaoMonitoramento, db: Session) -> str:
    """Resolve o instrumento pai para a resposta HTTP sem expor query ao router."""
    instrumento = monitoramento_repo.obter_instrumento_por_id(db, acao.instrumento_id)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {acao.instrumento_id} não encontrado.")
    return instrumento.nr_convenio


def listar_acoes_monitoradas(*, pendentes: bool, limit: int, db: Session) -> list[tuple[AcaoMonitoramento, str]]:
    """Leitura operacional: filtro e query permanecem fora da camada HTTP."""
    return monitoramento_repo.listar_acoes_monitoradas(db, pendentes=pendentes, limit=limit)
