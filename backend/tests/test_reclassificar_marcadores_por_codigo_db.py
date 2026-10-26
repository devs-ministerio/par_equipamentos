"""Reclassificação dos marcadores pelo código RENEM: religa, recalcula a chave e não apaga."""

import pytest
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.services.equipamento_marcadores import chave_da_evidencia
from scripts.atualizar_catalogo_equipamentos import atualizar
from scripts.reclassificar_marcadores_por_codigo import reclassificar

PREFIXO = "__pytest_reclass_"


def _catalogo_generico(db, codigo: str, nome: str) -> EquipamentoCatalogo:
    linha = db.scalar(select(EquipamentoCatalogo).where(EquipamentoCatalogo.codigo == codigo))
    if linha is None:
        linha = EquipamentoCatalogo(codigo=codigo, nome=nome)
        db.add(linha)
        db.flush()
    return linha


def _marcador(db, convenio, catalogo, descricao: str, chave: str) -> EquipamentoMarcador:
    marcador = EquipamentoMarcador(
        convenio_id=convenio.id,
        equipamento_catalogo_id=catalogo.id,
        descricao_original=descricao,
        tipo_evidencia="item_orcamentario",
        relacao="aquisicao",
        confianca=100,
        chave_evidencia=chave,
    )
    db.add(marcador)
    db.flush()
    return marcador


@pytest.mark.db
def test_religa_pelo_codigo_recalcula_a_chave_nao_toca_acessorio_e_e_idempotente():
    db = SessionLocal()
    try:
        atualizar(db, [], "2099-01-01")
        db.flush()
        endoscopia = _catalogo_generico(db, "endoscopia", "Endoscopia")
        ressonancia = db.scalar(select(EquipamentoCatalogo).where(EquipamentoCatalogo.codigo == "ressonancia"))
        assert ressonancia is not None
        convenio = Convenio(numero=f"{PREFIXO}1", convenente_nome="Hospital sintético", tipo_contratacao="Convênio")
        db.add(convenio)
        db.flush()
        convenio.siconv_raw = {
            "itens_plano_aplicacao": [
                {"DESCRICAO_ITEM": "000253-Arco Cirúrgico", "TIPO_DESPESA_ITEM": "BEM", "ID_ITEM_PAD": "1"},
                {"DESCRICAO_ITEM": "Reforma com arco cirúrgico", "TIPO_DESPESA_ITEM": "OBRA", "ID_ITEM_PAD": "2"},
            ]
        }
        db.flush()
        item = "010254-Sistema de Vídeo Endoscopia Rígida"
        acessorio = "011237-Monitor Multiparâmetros para Ressonância Magnética"
        rigida = _marcador(db, convenio, endoscopia, item, "chave-antiga-1")
        monitor = _marcador(db, convenio, ressonancia, acessorio, "chave-antiga-2")
        # When: simula e depois aplica
        simulado = reclassificar(db, aplicar=False)
        assert rigida.equipamento_catalogo_id == endoscopia.id
        aplicado = reclassificar(db, aplicar=True)
        db.flush()
        repetido = reclassificar(db, aplicar=True)
        # Then
        familia = db.scalar(select(EquipamentoCatalogo).where(EquipamentoCatalogo.codigo == "video_endoscopia_rigida"))
        assert familia is not None
        assert simulado.religados >= 1 and aplicado.religados >= 1 and repetido.religados == 0
        assert rigida.equipamento_catalogo_id == familia.id
        assert rigida.chave_evidencia == chave_da_evidencia(
            origem="convenio",
            origem_id=convenio.id,
            codigo="video_endoscopia_rigida",
            descricao=item,
            tipo_evidencia="item_orcamentario",
        )
        # acessório de ressonância não é o equipamento: fica onde estava e aparece como suspeito
        assert monitor.equipamento_catalogo_id == ressonancia.id
        assert aplicado.suspeitos["ressonancia"] >= 1
        # item de bem classificado sem marcador ganha o marcador; item de obra não
        criados = db.scalars(select(EquipamentoMarcador).where(EquipamentoMarcador.convenio_id == convenio.id)).all()
        descricoes = {m.descricao_original for m in criados}
        assert "000253-Arco Cirúrgico" in descricoes and "Reforma com arco cirúrgico" not in descricoes
        assert aplicado.criados == 1 and repetido.criados == 0
        # nada foi apagado
        assert db.scalar(select(EquipamentoMarcador).where(EquipamentoMarcador.id == monitor.id)) is not None
    finally:
        db.rollback()
        db.close()
