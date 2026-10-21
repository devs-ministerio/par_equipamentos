"""Reserva DOCX rejeita disputa sem fila e libera após sucesso/erro."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from app.domain_errors import RelatorioOcupadoError
from app.services.relatorios_admissao import _GERACAO_DOCX, reservar_geracao_docx


def test_reserva_recusa_concorrencia_e_libera_apos_concluir():
    # Arrange
    def disputar():
        with reservar_geracao_docx():
            pytest.fail("Geração concorrente não deveria ser admitida.")

    # Act / Assert
    with reservar_geracao_docx(), ThreadPoolExecutor(max_workers=1) as pool:
        with pytest.raises(RelatorioOcupadoError) as erro:
            pool.submit(disputar).result(timeout=5)
        assert erro.value.status_code == 503
    with reservar_geracao_docx():
        assert _GERACAO_DOCX.locked() is True
    assert _GERACAO_DOCX.locked() is False


def test_erro_libera_reserva_sem_suprimir_excecao():
    # Arrange / Act / Assert
    with pytest.raises(ValueError, match="falha sintética"), reservar_geracao_docx():
        raise ValueError("falha sintética")
    with reservar_geracao_docx():
        assert _GERACAO_DOCX.locked() is True
    assert _GERACAO_DOCX.locked() is False
