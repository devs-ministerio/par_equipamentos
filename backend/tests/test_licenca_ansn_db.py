"""Licença de operação pela fonte oficial da ANSN: carga, vínculo com o CNES, leitura do instrumento e alerta."""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.db.models import CnesEstabelecimento, EquipamentoCatalogo, InstalacaoAnsn, VinculoLicencaEstabelecimento
from app.domain_errors import ValidationError
from app.services import licenca_operacao as svc
from app.services.carga_licencas_ansn import importar_instalacoes, importar_vinculos
from app.services.monitoramento_resumo import montar_resumo_monitoramento
from tests.test_entregas_equipamento_db import Cenario, db  # noqa: F401

pytestmark = pytest.mark.db

HOJE = date.today()


def _matricula() -> str:
    return f"T{uuid4().hex[:7]}"


def _cnes(sessao) -> str:
    numero = str(uuid4().int)[:7]
    sessao.add(CnesEstabelecimento(cnes=numero, nome_estabelecimento="HOSPITAL TESTE", municipio="X", uf="SP"))
    sessao.flush()
    return numero


def _registro(matricula: str, **kw) -> dict:
    base = {
        "matricula": matricula,
        "designacao": "HOSPITAL TESTE",
        "cidade": "X",
        "uf": "SP",
        "area_atuacao": "RADIOTERAPIA",
        "status": "valida",
        "validade": str(HOJE + timedelta(days=100)),
    }
    return base | kw


def _com_acelerador(sessao, c) -> None:
    familia = sessao.scalars(select(EquipamentoCatalogo).where(EquipamentoCatalogo.codigo == "acelerador_linear")).one()
    c.dois.catalogo_id = familia.id
    sessao.flush()


def test_carga_de_instalacoes_e_idempotente_e_atualiza(db):  # noqa: F811
    m = _matricula()
    r1 = importar_instalacoes(db, [_registro(m)], HOJE - timedelta(days=30), aplicar=True)
    assert r1["nova"] == 1
    r2 = importar_instalacoes(db, [_registro(m)], HOJE - timedelta(days=20), aplicar=True)
    assert r2["inalterada"] == 1
    nova = str(HOJE + timedelta(days=900))
    r3 = importar_instalacoes(db, [_registro(m, validade=nova)], HOJE, aplicar=True)
    assert r3["atualizada"] == 1
    inst = db.get(InstalacaoAnsn, m)
    assert inst.validade == date.fromisoformat(nova)
    assert inst.consultado_em == HOJE and inst.primeira_consulta_em == HOJE - timedelta(days=30)


def test_carga_recusa_matricula_repetida_e_situacao_desconhecida(db):  # noqa: F811
    m = _matricula()
    with pytest.raises(ValidationError):
        importar_instalacoes(db, [_registro(m), _registro(m)], HOJE, aplicar=True)
    with pytest.raises(ValidationError):
        importar_instalacoes(db, [_registro(m, status="vencida")], HOJE, aplicar=True)


def test_simulacao_nao_grava(db):  # noqa: F811
    m = _matricula()
    resultado = importar_instalacoes(db, [_registro(m)], HOJE, aplicar=False)
    assert resultado["nova"] == 1 and db.get(InstalacaoAnsn, m) is None


def test_vinculos_rejeitam_cnes_desconhecido_e_sao_idempotentes(db):  # noqa: F811
    cnes = _cnes(db)
    m = _matricula()
    importar_instalacoes(db, [_registro(m)], HOJE, aplicar=True)
    contagem, rejeitadas = importar_vinculos(db, [(cnes, m), ("9999999", m)], aplicar=True)
    assert contagem["vínculo novo"] == 1 and len(rejeitadas) == 1
    contagem2, _ = importar_vinculos(db, [(cnes, m)], aplicar=True)
    assert contagem2["já vinculada"] == 1 and "vínculo novo" not in contagem2
    assert len(db.scalars(select(VinculoLicencaEstabelecimento).where(VinculoLicencaEstabelecimento.cnes == cnes)).all()) == 1


def test_matricula_informada_fora_da_carga_e_aceita_e_marcada(db):  # noqa: F811
    cnes = _cnes(db)
    contagem, _ = importar_vinculos(db, [(cnes, "16902")], aplicar=True)
    assert contagem["matrícula fora da carga da ANSN"] == 1


def test_instrumento_sem_item_que_exige_nao_tem_card(db):  # noqa: F811
    c = Cenario(db)
    leitura = svc.obter_licenca_operacao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert leitura.exige is False and leitura.vinculos == []


def test_instrumento_que_exige_sem_cnes(db):  # noqa: F811
    c = Cenario(db)
    _com_acelerador(db, c)
    leitura = svc.obter_licenca_operacao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert leitura.exige and leitura.sem_cnes and leitura.areas_exigidas == ["RADIOTERAPIA"]


def test_vinculo_confirmado_traz_validade_oficial_e_area_sem_vinculo_some(db):  # noqa: F811
    c = Cenario(db)
    _com_acelerador(db, c)
    c.inst.cnes = _cnes(db)
    m = _matricula()
    importar_instalacoes(db, [_registro(m)], HOJE, aplicar=True)
    leitura = svc.obter_licenca_operacao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert leitura.areas_sem_vinculo == ["RADIOTERAPIA"] and leitura.vinculos == []
    importar_vinculos(db, [(c.inst.cnes, m)], aplicar=True)
    leitura = svc.obter_licenca_operacao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert leitura.areas_sem_vinculo == []
    (v,) = leitura.vinculos
    assert v.situacao == "valida" and v.dias == 100 and v.area == "RADIOTERAPIA"


def test_matricula_que_some_da_carga_nova_nao_consta_e_nao_e_vencida(db):  # noqa: F811
    c = Cenario(db)
    _com_acelerador(db, c)
    c.inst.cnes = _cnes(db)
    antiga, nova = _matricula(), _matricula()
    importar_instalacoes(db, [_registro(antiga)], HOJE - timedelta(days=10), aplicar=True)
    importar_vinculos(db, [(c.inst.cnes, antiga)], aplicar=True)
    importar_instalacoes(db, [_registro(nova)], HOJE, aplicar=True)
    (v,) = svc.obter_licenca_operacao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular).vinculos
    assert v.situacao == "nao_consta" and v.validade is None and v.dias is None


def test_suspensa_nao_tem_validade(db):  # noqa: F811
    c = Cenario(db)
    _com_acelerador(db, c)
    c.inst.cnes = _cnes(db)
    m = _matricula()
    importar_instalacoes(db, [_registro(m, status="suspensa", validade=None)], HOJE, aplicar=True)
    importar_vinculos(db, [(c.inst.cnes, m)], aplicar=True)
    (v,) = svc.obter_licenca_operacao(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular).vinculos
    assert v.situacao == "suspensa" and v.validade is None


def test_alerta_do_resumo_vem_do_vinculo_oficial(db):  # noqa: F811
    c = Cenario(db)
    _com_acelerador(db, c)
    c.inst.cnes = _cnes(db)
    m = _matricula()
    importar_instalacoes(db, [_registro(m, validade=str(HOJE + timedelta(days=30)))], HOJE, aplicar=True)
    importar_vinculos(db, [(c.inst.cnes, m)], aplicar=True)
    resumo = montar_resumo_monitoramento(db)
    meus = [a for a in resumo.licencas_vencendo if a.nr_convenio == c.inst.nr_convenio]
    assert len(meus) == 1 and meus[0].fonte == "ansn" and meus[0].dias == 30 and meus[0].matricula == m
