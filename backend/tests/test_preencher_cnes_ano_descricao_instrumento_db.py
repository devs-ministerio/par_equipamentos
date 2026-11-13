"""Backfill de cnes/ano_instrumento/equipamento_descricao de Convenio para InstrumentoEquipamento.

Achado em produção (investigação do Painel de Gestão, 2026-10-28): instrumentos tipo
"Convênio" criados sem passar pelo enriquecimento normal já têm o dado em Convenio.cnes/
Convenio.ano_instrumento (import SICONV), só não foi copiado; equipamento_descricao não
existe em Convenio, mas pode ser derivado dos itens de aquisição em ItemPlano.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import CnesEstabelecimento, Convenio, InstrumentoEquipamento, ItemPlano
from scripts.preencher_cnes_ano_descricao_instrumento import executar

pytestmark = pytest.mark.db


@pytest.fixture
def db():
    conexao = engine.connect()
    transacao = conexao.begin()
    sessao = Session(bind=conexao, join_transaction_mode="create_savepoint")
    try:
        yield sessao
    finally:
        sessao.close()
        transacao.rollback()
        conexao.close()


def _cnes(db, codigo: str) -> None:
    if db.get(CnesEstabelecimento, codigo) is None:
        db.add(CnesEstabelecimento(cnes=codigo, nome_estabelecimento="Hospital Teste"))
        db.flush()


def _convenio_e_instrumento(
    db,
    *,
    cnes_convenio: str | None = None,
    ano_convenio: int | None = None,
    cnes_instrumento: str | None = None,
    ano_instrumento: int | None = None,
    equipamento_descricao: str | None = None,
    fora_escopo: bool = False,
) -> tuple[Convenio, InstrumentoEquipamento]:
    if cnes_convenio:
        _cnes(db, cnes_convenio)
    if cnes_instrumento:
        _cnes(db, cnes_instrumento)
    numero = f"CV{uuid4().hex[:10]}"
    conv = Convenio(
        numero=numero,
        objeto="x",
        convenente_nome="x",
        cnes=cnes_convenio,
        ano_instrumento=ano_convenio,
        fora_escopo_equipamentos=fora_escopo,
    )
    db.add(conv)
    inst = InstrumentoEquipamento(
        nr_convenio=numero,
        nome_convenente="x",
        tipo_contratacao="Convênio",
        cnes=cnes_instrumento,
        ano_instrumento=ano_instrumento,
        equipamento_descricao=equipamento_descricao,
    )
    db.add(inst)
    db.flush()
    return conv, inst


def _item(db, instrumento: InstrumentoEquipamento, convenio: Convenio, descricao: str, *, tipo_lancamento="aquisicao"):
    item = ItemPlano(
        convenio_id=convenio.id,
        instrumento_id=instrumento.id,
        origem="manual",
        id_origem=uuid4().hex,
        descricao=descricao,
        tipo_lancamento=tipo_lancamento,
    )
    db.add(item)
    db.flush()
    return item


def test_copia_cnes_e_ano_de_convenio_quando_instrumento_esta_nulo(db):
    conv, inst = _convenio_e_instrumento(db, cnes_convenio="1234567", ano_convenio=2021)
    resultado = executar(db, aplicar=True)
    assert inst.cnes == "1234567"
    assert inst.ano_instrumento == 2021
    assert resultado.cnes_preenchidos == 1
    assert resultado.ano_preenchidos == 1


def test_nao_sobrescreve_cnes_ou_ano_ja_preenchidos(db):
    conv, inst = _convenio_e_instrumento(
        db, cnes_convenio="1234567", ano_convenio=2021, cnes_instrumento="7654321", ano_instrumento=1999
    )
    resultado = executar(db, aplicar=True)
    assert inst.cnes == "7654321"
    assert inst.ano_instrumento == 1999
    assert resultado.cnes_preenchidos == 0
    assert resultado.ano_preenchidos == 0


def test_nao_preenche_quando_convenio_tambem_esta_nulo(db):
    conv, inst = _convenio_e_instrumento(db)
    resultado = executar(db, aplicar=True)
    assert inst.cnes is None
    assert inst.ano_instrumento is None
    assert resultado.cnes_preenchidos == 0
    assert resultado.ano_preenchidos == 0


def test_deriva_equipamento_descricao_de_item_unico(db):
    conv, inst = _convenio_e_instrumento(db)
    _item(db, inst, conv, "010911-Acelerador Linear")
    resultado = executar(db, aplicar=True)
    assert inst.equipamento_descricao == "010911-Acelerador Linear"
    assert resultado.descricao_preenchidos == 1


def test_deriva_equipamento_descricao_concatenando_multiplos_itens_com_mais(db):
    conv, inst = _convenio_e_instrumento(db)
    _item(db, inst, conv, "000460-Extrator")
    _item(db, inst, conv, "000024-Micropipeta")
    executar(db, aplicar=True)
    assert inst.equipamento_descricao == "000460-Extrator + 000024-Micropipeta"


def test_equipamento_descricao_ignora_item_nao_aquisicao(db):
    conv, inst = _convenio_e_instrumento(db)
    _item(db, inst, conv, "000460-Extrator", tipo_lancamento="aquisicao")
    _item(db, inst, conv, "Rendimento da aplicação", tipo_lancamento="rendimento_aplicacao")
    executar(db, aplicar=True)
    assert inst.equipamento_descricao == "000460-Extrator"


def test_nao_sobrescreve_equipamento_descricao_ja_preenchida(db):
    conv, inst = _convenio_e_instrumento(db, equipamento_descricao="Já preenchido")
    _item(db, inst, conv, "000460-Extrator")
    resultado = executar(db, aplicar=True)
    assert inst.equipamento_descricao == "Já preenchido"
    assert resultado.descricao_preenchidos == 0


def test_sem_item_plano_fica_sem_fonte_e_e_contabilizado(db):
    conv, inst = _convenio_e_instrumento(db)
    resultado = executar(db, aplicar=True)
    assert inst.equipamento_descricao is None
    assert resultado.descricao_sem_fonte == 1


def test_ignora_fora_de_escopo(db):
    conv, inst = _convenio_e_instrumento(db, cnes_convenio="1234567", ano_convenio=2021, fora_escopo=True)
    resultado = executar(db, aplicar=True)
    assert inst.cnes is None
    assert inst.ano_instrumento is None
    assert resultado.cnes_preenchidos == 0


def test_ignora_tipo_contratacao_diferente_de_convenio(db):
    conv, inst = _convenio_e_instrumento(db, cnes_convenio="1234567")
    inst.tipo_contratacao = "PERSUS I"
    db.flush()
    resultado = executar(db, aplicar=True)
    assert inst.cnes is None
    assert resultado.cnes_preenchidos == 0


def test_simulacao_nao_grava(db):
    conv, inst = _convenio_e_instrumento(db, cnes_convenio="1234567", ano_convenio=2021)
    _item(db, inst, conv, "010911-Acelerador Linear")
    resultado = executar(db, aplicar=False)
    db.expire_all()
    assert inst.cnes is None
    assert inst.ano_instrumento is None
    assert inst.equipamento_descricao is None
    assert resultado.cnes_preenchidos == 1
    assert resultado.ano_preenchidos == 1
    assert resultado.descricao_preenchidos == 1


def test_idempotente(db):
    conv, inst = _convenio_e_instrumento(db, cnes_convenio="1234567", ano_convenio=2021)
    _item(db, inst, conv, "010911-Acelerador Linear")
    executar(db, aplicar=True)
    resultado = executar(db, aplicar=True)
    assert resultado.cnes_preenchidos == 0
    assert resultado.ano_preenchidos == 0
    assert resultado.descricao_preenchidos == 0
