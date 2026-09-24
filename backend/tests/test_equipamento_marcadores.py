"""Integração do caso de uso e repository de marcadores relacionais."""
from __future__ import annotations

from app.db.base import SessionLocal
from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.equipamentos import EvidenciaEquipamento
from app.repositories.equipamento_marcadores import listar_por_origens
from app.services.equipamento_marcadores import DadosMarcador, chave_da_evidencia, registrar_marcadores


def test_chave_da_evidencia_normaliza_apenas_espaco_externo():
    comum = dict(origem="convenio", origem_id=7, codigo="tomografo", tipo_evidencia="planilha")

    assert chave_da_evidencia(descricao=" Tomógrafo ", **comum) == chave_da_evidencia(
        descricao="Tomógrafo", **comum
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
        chaves: set[tuple[str, int, int, str]] = set()

        assert registrar_marcadores(
            db=db, origem="convenio", origem_id=convenio.id, marcadores=[marcador], chaves_existentes=chaves
        ) == 1
        db.flush()
        assert registrar_marcadores(
            db=db, origem="convenio", origem_id=convenio.id, marcadores=[marcador], chaves_existentes=chaves
        ) == 0
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
