"""Casos de uso de instrumentos monitorados."""
from __future__ import annotations

from dataclasses import asdict, dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_monitoramento
from app.db.models import InstrumentoEquipamento, User


@dataclass(frozen=True)
class NovoInstrumentoMonitorado:
    nr_convenio: str
    cnpj_convenente: str
    nome_convenente: str
    tipo_contratacao: str
    municipio: str | None = None
    uf: str | None = None
    cnes: str | None = None
    programa: str | None = None
    tp_instrumento_programa: str | None = None
    componente: str | None = None
    ano_instrumento: int | None = None
    tecnico_titular: str | None = None
    tecnico_suplente: str | None = None
    nivel_monitoramento: str | None = None
    finalidade: str | None = None
    modalidade_onco: str | None = None
    responsavel_execucao_nome: str | None = None
    responsavel_execucao_contato: str | None = None
    situacao_prestacao_contas: str | None = None


def criar_instrumento_monitorado(
    *,
    dados: NovoInstrumentoMonitorado,
    db: Session,
    usuario: User,
) -> InstrumentoEquipamento:
    assert_pode_editar_monitoramento(usuario)
    ja_existe = db.execute(
        select(InstrumentoEquipamento.id).where(InstrumentoEquipamento.nr_convenio == dados.nr_convenio)
    ).scalar_one_or_none()
    if ja_existe is not None:
        raise HTTPException(409, f"Já existe instrumento monitorado com nr_convenio={dados.nr_convenio}.")

    instrumento = InstrumentoEquipamento(**asdict(dados))
    db.add(instrumento)
    db.flush()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action="created",
        details={
            "nr_convenio": dados.nr_convenio,
            "tipo_contratacao": dados.tipo_contratacao,
            "tecnico_titular": dados.tecnico_titular,
        },
    )
    return instrumento
