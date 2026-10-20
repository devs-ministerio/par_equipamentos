"""Integração do caso de uso e repository de marcadores relacionais."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.equipamentos import EvidenciaEquipamento
from app.repositories.auditoria_marcadores import listar_evidencias_automaticas
from app.repositories.convenios import listar_convenios_filtrados
from app.repositories.equipamento_marcadores import OrigemMarcador, listar_por_origens
from app.routers.convenios import _aplicar_filtros_convenio
from app.services.equipamento_marcadores import DadosMarcador, chave_da_evidencia, registrar_marcadores


def test_chave_da_evidencia_normaliza_apenas_espaco_externo():
    assert chave_da_evidencia(
        descricao=" Tomógrafo ", origem="convenio", origem_id=7, codigo="tomografo", tipo_evidencia="planilha"
    ) == chave_da_evidencia(
        descricao="Tomógrafo", origem="convenio", origem_id=7, codigo="tomografo", tipo_evidencia="planilha"
    )


def test_registrar_marcador_generico_e_idempotente_com_cache():
    db = SessionLocal()
    try:
        convenio = Convenio(numero="__pytest_marcador_generico__", convenente_nome="Convênio Pytest")
        db.add(convenio)
        db.flush()
        marcador = DadosMarcador(
            evidencia=EvidenciaEquipamento(
                codigo="item_plano_pytest",
                nome="Equipamento não prioritário",
                descricao_original="Equipamento não prioritário",
                relacao="aquisicao",
            ),
            tipo_evidencia="planilha",
            confianca=90,
            origem_dado="fixture",
        )
        chaves: set[tuple[OrigemMarcador, int, int, str]] = set()

        assert (
            registrar_marcadores(
                db=db, origem="convenio", origem_id=convenio.id, marcadores=[marcador], chaves_existentes=chaves
            )
            == 1
        )
        db.flush()
        assert (
            registrar_marcadores(
                db=db, origem="convenio", origem_id=convenio.id, marcadores=[marcador], chaves_existentes=chaves
            )
            == 0
        )
        catalogo = db.query(EquipamentoCatalogo).filter_by(codigo="item_plano_pytest").one()
        assert catalogo.prioritario is False
        assert db.query(EquipamentoMarcador).filter_by(convenio_id=convenio.id).count() == 1
    finally:
        db.rollback()
        db.close()


def test_listagem_prioriza_catalogo_prioritario_sem_apagar_evidencia_auditavel():
    db = SessionLocal()
    try:
        convenio = Convenio(numero="__pytest_marcador_lista__", convenente_nome="Convênio Pytest")
        prioritario = EquipamentoCatalogo(codigo="pytest_prioritario", nome="Prioritário", prioritario=True)
        outro = EquipamentoCatalogo(codigo="pytest_outro", nome="Outro", prioritario=False)
        db.add_all([convenio, prioritario, outro])
        db.flush()
        db.add_all(
            [
                EquipamentoMarcador(
                    equipamento_catalogo_id=prioritario.id,
                    convenio_id=convenio.id,
                    descricao_original="Prioritário A",
                    tipo_evidencia="objeto",
                    relacao="aquisicao",
                    confianca=100,
                    chave_evidencia="pytest-prioritario",
                ),
                EquipamentoMarcador(
                    equipamento_catalogo_id=outro.id,
                    convenio_id=convenio.id,
                    descricao_original="Outro B",
                    tipo_evidencia="planilha",
                    relacao="aquisicao",
                    confianca=90,
                    chave_evidencia="pytest-outro",
                ),
            ]
        )
        db.flush()

        resultado = listar_por_origens(db, convenio_ids={convenio.id})

        assert [item.codigo for item in resultado[("convenio", convenio.id)]] == ["pytest_prioritario"]
        assert db.query(EquipamentoMarcador).filter_by(convenio_id=convenio.id).count() == 2
        assert listar_por_origens(db) == {}
    finally:
        db.rollback()
        db.close()


def test_auditoria_pagina_automaticos_sem_incluir_planilha_ou_alterar_evidencia():
    # Arrange: evidências sintéticas no banco real, revertidas ao final.
    db = SessionLocal()
    try:
        convenio = Convenio(numero="__pytest_auditoria_obras__", convenente_nome="Hospital sintético")
        catalogo = EquipamentoCatalogo(codigo="pytest_obra", nome="Equipamento sintético", prioritario=True)
        db.add_all([convenio, catalogo])
        db.flush()
        marcadores = [
            EquipamentoMarcador(
                convenio_id=convenio.id,
                equipamento_catalogo_id=catalogo.id,
                descricao_original="Construção do hospital com acelerador linear.",
                tipo_evidencia=tipo,
                relacao="aquisicao",
                confianca=100,
                chave_evidencia=f"pytest-auditoria-{tipo}",
            )
            for tipo in ("item_orcamentario", "meta", "planilha")
        ]
        db.add_all(marcadores)
        db.flush()
        # Act: cursor exclui o primeiro e a origem manual nunca entra.
        pagina = listar_evidencias_automaticas(db, depois_id=marcadores[0].id)
        # Assert: leitura não modifica a relação nem a descrição persistida.
        assert [item.marcador_id for item in pagina] == [marcadores[1].id]
        assert pagina[0].numero_convenio == convenio.numero
        assert pagina[0].relacao == "aquisicao"
        assert pagina[0].descricao == marcadores[1].descricao_original
        assert len(pagina) <= 200
        assert listar_evidencias_automaticas(db, depois_id=marcadores[-1].id) == []
    finally:
        db.rollback()
        db.close()


@pytest.mark.parametrize(
    "relacao,elegivel", [("aquisicao", True), ("modernizacao", True), ("mencao", False), ("existente", False)]
)
def test_filtro_visual_e_relatorio_respeitam_relacao_sem_apagar_marcador(relacao, elegivel):
    # Arrange
    db = SessionLocal()
    try:
        convenio = Convenio(numero=f"__pytest_relacao_{relacao}__", convenente_nome="Hospital sintético")
        catalogo = EquipamentoCatalogo(
            codigo=f"pytest_relacao_{relacao}", nome=f"Família sintética {relacao}", prioritario=True
        )
        db.add_all([convenio, catalogo])
        db.flush()
        marcador = EquipamentoMarcador(
            convenio_id=convenio.id,
            equipamento_catalogo_id=catalogo.id,
            descricao_original="Descrição oficial sintética preservada",
            tipo_evidencia="item_orcamentario",
            relacao=relacao,
            confianca=100,
            chave_evidencia=f"pytest-relacao-{relacao}",
        )
        db.add(marcador)
        db.flush()
        # Act: três consumidores executam queries reais com o mesmo contrato.
        query = _aplicar_filtros_convenio(
            select(Convenio).where(Convenio.id == convenio.id),
            busca=None,
            uf=None,
            equipamento=catalogo.nome,
            situacao=None,
            ano=None,
            programa=None,
            tipo_contratacao=None,
        )
        ids_ui = [item.id for item in db.scalars(query)]
        ids_relatorio = [item.id for item in listar_convenios_filtrados(db, equipamento=catalogo.nome)]
        listagem = listar_por_origens(db, convenio_ids={convenio.id})
        # Assert
        assert ids_ui == ([convenio.id] if elegivel else [])
        assert ids_relatorio == ([convenio.id] if elegivel else [])
        assert (("convenio", convenio.id) in listagem) is elegivel
        salvo = db.get(EquipamentoMarcador, marcador.id)
        assert salvo is not None
        assert salvo.descricao_original == marcador.descricao_original
        assert marcador.relacao == relacao
    finally:
        db.rollback()
        db.close()
