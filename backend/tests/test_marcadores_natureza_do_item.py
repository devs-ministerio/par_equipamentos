"""Marcador de equipamento vale para o que o item é, não para o que ele menciona."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.equipamentos import classificar_descricoes
from app.services.equipamento_marcadores import chave_da_evidencia
from scripts.atualizar_catalogo_equipamentos import atualizar
from scripts.sanear_marcadores_equipamento import sanear


def _codigos(descricao: str, **kwargs) -> list[str]:
    return [e.codigo for e in classificar_descricoes([descricao], **kwargs)]


def test_acessorio_para_ressonancia_nao_e_ressonancia():
    codigos = _codigos("011237-Monitor Multiparâmetros para Ressonância Magnética")
    assert "ressonancia" not in codigos
    assert len(codigos) == 1 and codigos[0].startswith("item_plano_")


def test_rendimento_que_cita_o_equipamento_nao_gera_marcador():
    assert _codigos("Rendimento de aplicação para complementação do mamógrafo, conforme parecer favorável.") == []


def test_item_composto_gera_um_marcador_por_equipamento_e_sem_acessorio():
    codigos = _codigos("000301-PET CT + 010925-Mamógrafo + 011237-Monitor Multiparâmetros para Ressonância Magnética")
    assert "pet_ct" in codigos and "mamografo" in codigos and "ressonancia" not in codigos


def test_especificacao_longa_nao_soma_equipamentos_citados_no_texto():
    descricao = "01)\tAcelerador Linear para radioterapia com energia de 6MV fótons- Console de controle digital"
    assert _codigos(descricao) == ["acelerador_linear"]


def test_tomografo_acima_de_16_canais_nao_e_da_familia_ate_16():
    assert "tomografo_ate_16_canais" not in _codigos(
        "011805-Tomógrafo Computadorizado (Acima de 16 canais até 80 canais)"
    )
    assert _codigos("011804-Tomógrafo Computadorizado (Até 16 canais)") == ["tomografo_ate_16_canais"]


def test_narrativa_continua_marcando_por_palavra_chave():
    assert "ressonancia" in _codigos("Aquisição de ressonância magnética", relacao_padrao="mencao")


@pytest.mark.db
def test_sanear_remove_o_marcador_errado_cria_o_do_item_e_e_idempotente():
    db = SessionLocal()
    try:
        atualizar(db, [], "2099-01-01")
        db.flush()
        ressonancia = db.scalar(select(EquipamentoCatalogo).where(EquipamentoCatalogo.codigo == "ressonancia"))
        assert ressonancia is not None
        convenio = Convenio(numero="__pytest_sanear_marcador__", convenente_nome="Hospital sintético")
        db.add(convenio)
        db.flush()
        descricao = "011237-Monitor Multiparâmetros para Ressonância Magnética"
        errado = EquipamentoMarcador(
            convenio_id=convenio.id,
            equipamento_catalogo_id=ressonancia.id,
            descricao_original=descricao,
            tipo_evidencia="item_orcamentario",
            relacao="aquisicao",
            confianca=100,
            chave_evidencia=chave_da_evidencia(
                origem="convenio",
                origem_id=convenio.id,
                codigo="ressonancia",
                descricao=descricao,
                tipo_evidencia="item_orcamentario",
            ),
        )
        db.add(errado)
        db.flush()
        errado_id = errado.id
        db.expunge(errado)

        simulado = sanear(db, aplicar=False)
        assert simulado.removidos >= 1
        assert db.get(EquipamentoMarcador, errado_id) is not None

        sanear(db, aplicar=True)
        db.flush()
        restantes = (
            db.execute(select(EquipamentoMarcador).where(EquipamentoMarcador.convenio_id == convenio.id))
            .scalars()
            .all()
        )
        catalogos = {c.id: c.codigo for c in db.scalars(select(EquipamentoCatalogo))}
        codigos = [catalogos[m.equipamento_catalogo_id] for m in restantes]
        assert len(codigos) == 1 and codigos[0].startswith("item_plano_")

        repetido = sanear(db, aplicar=True)
        mesmos = (
            db.execute(select(EquipamentoMarcador).where(EquipamentoMarcador.convenio_id == convenio.id))
            .scalars()
            .all()
        )
        assert len(mesmos) == 1
        assert repetido.criados == 0
    finally:
        db.rollback()
        db.close()
