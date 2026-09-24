"""Regressao do bloco 6 (constituicao database): listagem de propostas
candidatas pagina na origem e expoe contrato {total, itens}, sem voltar
ao array cru. `metas_resumo` permanece no item de listagem de proposito
(card/filtros client-side ainda dependem dele)."""

from __future__ import annotations

import inspect

from app.routers.propostas_candidatas import (
    PropostaCandidataListaRead,
    PropostaCandidataRead,
    listar_propostas_candidatas,
)


def test_listagem_propostas_devolve_envelope_com_total_e_itens():
    assert set(PropostaCandidataListaRead.model_fields) == {"total", "itens"}
    assert PropostaCandidataListaRead.model_fields["itens"].annotation == list[PropostaCandidataRead]


def test_listagem_propostas_aceita_paginacao_e_filtros_sql():
    params = inspect.signature(listar_propostas_candidatas).parameters

    assert params["pagina"].default.default == 1
    assert params["tamanho_pagina"].default.default == 50
    assert "uf" in params
    assert "busca" in params
    assert "ano" in params
    assert "id_programa" in params


def test_listagem_propostas_mantem_metas_resumo_no_item():
    """Diferente de convenio.siconv_raw: metas_resumo e o dado da revisao,
    nao um payload cru de detalhe separado."""
    assert "metas_resumo" in PropostaCandidataRead.model_fields
