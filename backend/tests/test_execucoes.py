"""Regressão do incidente 2026-09-25: uma execução com `status=published` e
`started_at` mais recente, mas que nunca virou o `published_execution_id` da
sua própria competência (exatamente o que `tests/fixtures_cobertura.py`
grava quando roda fora de um fluxo controlado), não pode ser escolhida como
"a execução mais recente" da família -- só a execução que É o ponteiro
`Competency.published_execution_id` da sua competência conta.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db.base import SessionLocal
from app.db.models import Competency, Execution, ExecutionMode, ExecutionStatus
from app.repositories.execucoes import obter_execucao_publicada_mais_recente


def test_execucao_orfa_mais_recente_nao_vence_a_execucao_publicada():
    db = SessionLocal()
    try:
        agora = datetime.now(UTC)

        competencia_oficial = Competency(label="__teste_execucoes_oficial__", equipment_family="__TESTE_EXECUCOES__")
        db.add(competencia_oficial)
        db.flush()
        oficial = Execution(
            competency_id=competencia_oficial.id,
            version=1,
            mode=ExecutionMode.automatic,
            status=ExecutionStatus.published,
            started_at=agora - timedelta(days=30),
            config_chave_macrorregiao="ibge_municipio",
            config_denominador_oferta="qt_existente_sus",
            active_sources={},
        )
        db.add(oficial)
        db.flush()
        competencia_oficial.published_execution_id = oficial.id
        db.flush()

        # Simula o dado sintético do incidente: competência própria, execução
        # com status=published e started_at mais recente que a oficial, mas
        # o ponteiro published_execution_id da SUA competência nunca é setado.
        competencia_orfa = Competency(label="__teste_execucoes_orfa__", equipment_family="__TESTE_EXECUCOES__")
        db.add(competencia_orfa)
        db.flush()
        orfa = Execution(
            competency_id=competencia_orfa.id,
            version=1,
            mode=ExecutionMode.manual,
            status=ExecutionStatus.published,
            started_at=agora,
            config_chave_macrorregiao="ibge_municipio",
            config_denominador_oferta="qt_existente_sus",
            active_sources={},
        )
        db.add(orfa)
        db.flush()

        assert obter_execucao_publicada_mais_recente(db, "__TESTE_EXECUCOES__") == oficial.id

        db.rollback()  # nunca commita dado de teste
    finally:
        db.close()
