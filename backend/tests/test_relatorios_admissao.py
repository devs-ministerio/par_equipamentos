"""Admissão real entre threads, sem substituir montagem por um mock."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest

from app.domain_errors import RelatorioOcupadoError
from app.services.relatorios_admissao import reservar_geracao_docx


def test_recusa_docx_concorrente_e_libera_para_nova_geracao():
    # Given: uma thread mantém a reserva até ser explicitamente liberada.
    entrou, liberar = Event(), Event()

    def gerar_primeiro():
        with reservar_geracao_docx():
            entrou.set()
            assert liberar.wait(timeout=10)
        return "finalizado"

    with ThreadPoolExecutor(max_workers=1) as executor:
        primeiro = executor.submit(gerar_primeiro)
        try:
            assert entrou.wait(timeout=10)
            # When / Then: a segunda geração é recusada, sem fila.
            with pytest.raises(RelatorioOcupadoError) as erro:
                with reservar_geracao_docx():
                    pytest.fail("Montagem concorrente foi admitida.")
            assert erro.value.status_code == 503
        finally:
            liberar.set()
        assert primeiro.result(timeout=10) == "finalizado"
    with reservar_geracao_docx():
        assert entrou.is_set()


def test_erro_na_montagem_nao_deixa_reserva_ocupada():
    # Given / When: erro dentro da montagem protegida.
    with pytest.raises(RuntimeError, match="falha sintética"):
        with reservar_geracao_docx():
            raise RuntimeError("falha sintética")
    # Then: duas gerações seguintes podem adquirir a reserva normalmente.
    geracoes_concluidas = []
    for indice in range(2):
        with reservar_geracao_docx():
            geracoes_concluidas.append(indice)
    assert geracoes_concluidas == [0, 1]
