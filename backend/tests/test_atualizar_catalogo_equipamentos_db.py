"""Catálogo oficial por código: carga da RENEM, famílias com controle por unidade e adoção de linhas automáticas."""

import pytest
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import CodigoItemLegado, EquipamentoCatalogo, RenemItem
from app.equipamentos_renem import FAMILIAS
from scripts.atualizar_catalogo_equipamentos import ARQUIVO_PADRAO, atualizar, ler_renem

VERSAO = "2099-01-01"
ITENS = [
    {
        "codigo_item": "010925",
        "nome": "Mamógrafo",
        "definicao": None,
        "classificacao": "Médico Assistencial",
        "valor_sugerido": 1000.0,
        "item_dolarizado": False,
    },
    {
        "codigo_item": "000378",
        "nome": "Colposcópio",
        "definicao": None,
        "classificacao": "Médico Assistencial",
        "valor_sugerido": 50.0,
        "item_dolarizado": None,
    },
]


def test_valor_numerico_do_banco_nao_conta_como_alteracao():
    from decimal import Decimal

    from scripts.atualizar_catalogo_equipamentos import _igual

    assert _igual(Decimal("9441993.1733"), 9441993.1733)
    assert not _igual(Decimal("9441993.1733"), 9441993.2)


def test_planilha_renem_do_repositorio_tem_840_itens_e_codigos_de_seis_digitos():
    itens = ler_renem(ARQUIVO_PADRAO)
    assert len(itens) == 840
    assert all(len(i["codigo_item"]) == 6 and i["codigo_item"].isdigit() for i in itens)
    por_codigo = {i["codigo_item"]: i for i in itens}
    assert por_codigo["011806"]["nome"] == "Acelerador Linear (Básico - Intermediário)"
    assert "012005" not in por_codigo  # fora da lista de março de 2026


@pytest.mark.db
def test_cria_as_familias_liga_a_renem_adota_linha_automatica_e_e_idempotente():
    db = SessionLocal()
    try:
        # Given: linha gerada automaticamente com o mesmo nome de uma família nova
        automatica = EquipamentoCatalogo(codigo="item_plano_teste_colposcopio", nome="Colposcópio")
        db.add(automatica)
        db.flush()
        id_automatica = automatica.id
        # When
        primeira = atualizar(db, ITENS, VERSAO)
        db.flush()
        segunda = atualizar(db, ITENS, VERSAO)
        # Then: as 16 famílias existem, com controle por unidade e prioritárias
        catalogo = {c.codigo: c for c in db.scalars(select(EquipamentoCatalogo))}
        for familia in FAMILIAS:
            linha = catalogo[familia.catalogo_codigo]
            assert linha.controle_por_unidade and linha.prioritario
            assert linha.nome_oficial == familia.nome_oficial
        # a linha automática foi adotada, não duplicada: mesmo id, código novo
        assert catalogo["colposcopio"].id == id_automatica
        assert "item_plano_teste_colposcopio" not in catalogo
        assert "colposcopio" in primeira.catalogo_adotados
        # itens da RENEM ligados ao catálogo e códigos legados gravados
        ligados = {
            i.codigo_item: i.catalogo_id for i in db.scalars(select(RenemItem).where(RenemItem.versao_lista == VERSAO))
        }
        assert ligados["010925"] == catalogo["mamografo"].id
        assert ligados["000378"] == catalogo["colposcopio"].id
        legados = {c.codigo_item: c for c in db.scalars(select(CodigoItemLegado))}
        assert (
            legados["012005"].origem == "usuario" and legados["012005"].catalogo_id == catalogo["cirurgia_robotica"].id
        )
        assert legados["000277"].catalogo_id == catalogo["mamografo"].id
        # idempotente
        assert (segunda.renem_novos, segunda.renem_atualizados, segunda.legados_novos) == (0, 0, 0)
        assert segunda.catalogo_criados == [] and segunda.catalogo_atualizados == [] and segunda.catalogo_adotados == []
    finally:
        db.rollback()
        db.close()
