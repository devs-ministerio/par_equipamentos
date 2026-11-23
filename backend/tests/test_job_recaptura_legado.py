"""Lote de recaptura da CI: ignora o que não cabe, falha só em erro de coleta (sem banco)."""

import pytest

from app.domain_errors import ConflictError
from scripts import job_recaptura_legado as job


def _executar(monkeypatch, resultados: dict[int, Exception | None]):
    chamados: list[int] = []

    def recapturar(*, db, candidato_id, fabrica_sessao, coletar):
        chamados.append(candidato_id)
        if resultados[candidato_id] is not None:
            raise resultados[candidato_id]

    monkeypatch.setattr(job, "_pendentes", lambda: list(resultados))
    monkeypatch.setattr(job, "recapturar_candidato", recapturar)
    return chamados


def test_conflito_e_ignorado_e_os_demais_seguem(monkeypatch, capsys):
    chamados = _executar(monkeypatch, {1: ConflictError("Portal não confirmou."), 2: None})
    job.run()
    assert chamados == [1, 2]
    assert "1 gravada(s), 1 ignorada(s), 0 falha(s)" in capsys.readouterr().out


def test_falha_de_coleta_nao_interrompe_o_lote_mas_derruba_a_tarefa(monkeypatch):
    chamados = _executar(monkeypatch, {1: RuntimeError("rede"), 2: None})
    with pytest.raises(RuntimeError, match="incompleta"):
        job.run()
    assert chamados == [1, 2]


def test_sem_pendentes_nao_faz_nada(monkeypatch, capsys):
    chamados = _executar(monkeypatch, {})
    job.run()
    assert chamados == [] and "0 gravada(s)" in capsys.readouterr().out
