"""Cadastro do instrumento monitorado e designação de responsáveis."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_instrumento
from app.db.models import (
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    User,
    UserRole,
    UserStatus,
)
from app.domain_errors import NotFoundError, ValidationError
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.services.monitoramento_comum import _MODALIDADES_ONCO_VALIDAS, _TIPOLOGIAS_VALIDAS, _notificar_edicao_manual


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


def _obter_colaborador_ativo(db: Session, usuario_id: int, *, papel: str) -> User:
    """Resolve um responsável por identidade, nunca por nome livre.

    A relação é deliberadamente limitada a colaboradores ativos: admin/gestor
    podem administrar a atribuição, mas não podem aparecer como técnicos de
    campo. Isso mantém o controle de acesso e a lista exibida na UI coerentes.
    """
    usuario = db.get(User, usuario_id)
    if (
        usuario is None
        or usuario.role != UserRole.colaborador
        or usuario.status != UserStatus.active
        or usuario.deleted_at is not None
    ):
        raise ValidationError(f"{papel.capitalize()} deve ser um colaborador ativo cadastrado.")
    return usuario


def substituir_responsaveis_instrumento(
    *,
    db: Session,
    instrumento: InstrumentoEquipamento,
    titular_id: int,
    suplente_id: int | None,
) -> tuple[User, User | None]:
    """Substitui a dupla responsável e atualiza apenas o espelho textual.

    `instrumento_responsavel` é a fonte de verdade. Os nomes nas colunas
    legadas permanecem para compatibilidade de leitura das cargas históricas,
    mas nenhuma escrita aceita texto como identidade.
    """
    if suplente_id == titular_id:
        raise ValidationError("Técnico titular e suplente devem ser colaboradores distintos.")
    titular = _obter_colaborador_ativo(db, titular_id, papel="técnico titular")
    suplente = _obter_colaborador_ativo(db, suplente_id, papel="técnico suplente") if suplente_id is not None else None
    db.execute(delete(InstrumentoResponsavel).where(InstrumentoResponsavel.instrumento_id == instrumento.id))
    db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=titular.id, papel="titular"))
    if suplente is not None:
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=suplente.id, papel="suplente"))
    instrumento.tecnico_titular = titular.name
    instrumento.tecnico_suplente = suplente.name if suplente is not None else None
    return titular, suplente


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
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    assert_pode_editar_instrumento(usuario, obter_ids_responsaveis_do_instrumento(db, instrumento.id))

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

    titular_informado = "tecnico_titular_id" in alteracoes_brutas
    suplente_informado = "tecnico_suplente_id" in alteracoes_brutas
    alterou_responsaveis = titular_informado or suplente_informado
    titular_id = alteracoes_brutas.pop("tecnico_titular_id", None)
    suplente_id = alteracoes_brutas.pop("tecnico_suplente_id", None)
    # `pop` acima impede que os campos virtuais sejam tratados como colunas;
    # conserva a semântica PATCH de distinguir omissão de `null`.
    alteracoes: dict[str, dict[str, object | None]] = {}
    if alterou_responsaveis:
        atuais = {
            vinculo.papel: vinculo.usuario_id
            for vinculo in db.execute(
                select(InstrumentoResponsavel).where(InstrumentoResponsavel.instrumento_id == instrumento.id)
            ).scalars()
        }
        titular_efetivo = titular_id if titular_id is not None else atuais.get("titular")
        if not isinstance(titular_efetivo, int):
            raise ValidationError("Técnico titular é obrigatório para este instrumento.")
        suplente_efetivo = suplente_id if suplente_informado else atuais.get("suplente")
        if suplente_efetivo is not None and not isinstance(suplente_efetivo, int):
            raise ValidationError("Técnico suplente inválido.")
        titular, suplente = substituir_responsaveis_instrumento(
            db=db,
            instrumento=instrumento,
            titular_id=titular_efetivo,
            suplente_id=suplente_efetivo,
        )
        alteracoes["responsaveis"] = {
            "old": atuais,
            "new": {"titular_id": titular.id, "suplente_id": suplente.id if suplente else None},
        }

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
        _notificar_edicao_manual(
            db,
            instrumento_id=instrumento.id,
            titulo=f"{usuario.name} editou o convênio {nr_convenio}",
            corpo=f"Campo(s) alterado(s): {', '.join(alteracoes.keys())}",
        )
    db.commit()
    db.refresh(instrumento)
    return instrumento
