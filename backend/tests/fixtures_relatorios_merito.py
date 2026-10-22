"""Publicações e resultados sintéticos; não recalcula regras de cobertura."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models import (
    Competency,
    DeficitStatus,
    Execution,
    ExecutionMode,
    ExecutionStatus,
    MacroCoverage,
    MunicipalityCoverage,
)

FAMILIAS = ("TOMOGRAFO", "RESSONANCIA")
# Valores persistidos de referência, não resultados de um cálculo no teste.
RESULTADOS = (
    ("BA", "SALVADOR", "Macro sintética Bahia", 100_000, 2, 1, -1),
    ("PE", "RECIFE", "Macro sintética Pernambuco", 0, 0, 0, 0),
    ("SP", "SAO PAULO", "Macro sintética São Paulo", None, None, None, None),
)


def criar_execucao(db: Session, familia: str, label: str, ano: int, *, publicada: bool) -> Execution:
    competencia = Competency(label=label, equipment_family=familia)
    db.add(competencia)
    db.flush()
    execucao = Execution(
        competency_id=competencia.id,
        version=1,
        mode=ExecutionMode.manual,
        status=ExecutionStatus.published if publicada else ExecutionStatus.draft,
        started_at=datetime(ano, 1, 1, tzinfo=UTC),
        config_chave_macrorregiao="pytest_relatorio",
        config_denominador_oferta="sus_em_uso",
        active_sources={},
    )
    db.add(execucao)
    db.flush()
    if publicada:
        competencia.published_execution_id = execucao.id
        db.flush()
    return execucao


def criar_resultado(db: Session, execucao: Execution, familia: str, indice: int, *, nome_extra: str = "") -> None:
    uf, municipio, macro, populacao, necessario, disponivel, saldo = RESULTADOS[indice % len(RESULTADOS)]
    if familia == "RESSONANCIA" and indice % len(RESULTADOS) == 0:
        disponivel, saldo = 0, -2
    comuns = dict(
        execution_id=execucao.id,
        equipment_family=familia,
        state=uf,
        population=populacao,
        required_qty=necessario,
        available_qty=disponivel,
        # Contraste intencional: total existente não pode substituir SUS em uso.
        existing_qty=999,
        balance=saldo,
        deficit_status=DeficitStatus.not_available
        if populacao is None
        else (DeficitStatus.deficient if saldo == -1 else DeficitStatus.not_deficient),
    )
    db.add(MacroCoverage(macro_code=f"Q{indice}", macro_name=macro + nome_extra, **comuns))
    db.add(
        MunicipalityCoverage(
            ibge_code=f"{9800000 + indice}",
            municipality_name=municipio + nome_extra,
            **comuns,
        )
    )


def criar_publicacoes_merito(db: Session) -> dict[str, Execution]:
    atuais = {}
    for indice, familia in enumerate(FAMILIAS):
        antiga = criar_execucao(db, familia, "__qa_merito_antiga__", 2090, publicada=True)
        criar_resultado(db, antiga, familia, 0, nome_extra=" ANTIGA")
        atual = criar_execucao(db, familia, "__qa_merito_atual__", 2095 + indice, publicada=True)
        atuais[familia] = atual
        for n in range(len(RESULTADOS)):
            criar_resultado(db, atual, familia, n)
        avulsa = criar_execucao(db, familia, "__qa_merito_avulsa__", 2098, publicada=False)
        # Até status published sozinho é insuficiente: falta o ponteiro de publicação.
        avulsa.status = ExecutionStatus.published
        criar_resultado(db, avulsa, familia, 0, nome_extra=" AVULSA")
        rascunho = criar_execucao(db, familia, "__qa_merito_rascunho__", 2099, publicada=False)
        criar_resultado(db, rascunho, familia, 0, nome_extra=" RASCUNHO")
    db.flush()
    return atuais
