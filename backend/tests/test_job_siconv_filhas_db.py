"""Tabelas filhas do SICONV: carga inicial silenciosa, diff agrupado, falhas."""

from uuid import uuid4

import pytest
from sqlalchemy import func

from app.db.base import SessionLocal
from app.db.models import (
    Convenio,
    FonteCaptura,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
)
from scripts import job_verificacao_siconv as job


@pytest.fixture
def cenario(monkeypatch):
    numero = str(uuid4().int)[:12]
    db = SessionLocal()
    ultimo_id = db.query(func.coalesce(func.max(FonteCaptura.id), 0)).scalar()
    monkeypatch.setattr(job, "_filtrar_plano_aplicacao_por_id_proposta", lambda *a, **k: [])
    yield numero, db, ultimo_id
    ids = [c.id for c in db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id)]
    instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=numero).one_or_none()
    alvos = [instrumento.id] if instrumento else []
    notificacoes = [
        n.id
        for n in db.query(Notificacao).filter(
            (Notificacao.tipo == NotificacaoTipo.fonte_indisponivel) & Notificacao.entidade_id.in_(ids or [0])
            | (Notificacao.tipo == NotificacaoTipo.atualizacao_api) & Notificacao.entidade_id.in_(alvos or [0])
        )
    ]
    db.query(NotificacaoDestinatario).filter(NotificacaoDestinatario.notificacao_id.in_(notificacoes)).delete()
    db.query(Notificacao).filter(Notificacao.id.in_(notificacoes)).delete()
    db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id).delete()
    db.query(InstrumentoEquipamento).filter_by(nr_convenio=numero).delete()
    db.query(Convenio).filter_by(numero=numero).delete()
    db.commit()
    db.close()


def _criar(db, numero, raw=None):
    convenio = Convenio(
        numero=numero, convenente_nome="Teste", tipo_contratacao="Convênio", situacao="Em execução", siconv_raw=raw
    )
    instrumento = InstrumentoEquipamento(
        nr_convenio=numero,
        nome_convenente="Teste",
        tipo_contratacao="Convênio",
        situacao_prestacao_contas="Em execução",
    )
    db.add_all([convenio, instrumento])
    db.commit()
    db.refresh(instrumento)
    return instrumento.id


def _fonte(numero, principal, filhas):
    def fonte(nome, numeros, *, atualizar_cache):
        if nome == "siconv_convenio":
            return [{"NR_CONVENIO": numero, **principal}]
        resposta = filhas.get(nome)
        if isinstance(resposta, Exception):
            raise resposta
        return [{"NR_CONVENIO": numero, **linha} for linha in (resposta or [])]

    return fonte


def _avisos(db, instrumento_id):
    return db.query(Notificacao).filter_by(tipo=NotificacaoTipo.atualizacao_api, entidade_id=instrumento_id).all()


def test_primeira_captura_absorve_historico_sem_enxurrada(cenario, monkeypatch):
    numero, db, ultimo_id = cenario
    # Baseline antiga (carga de setembro): sem marcador _espelho.
    instrumento_id = _criar(
        db,
        numero,
        {"convenio": {"SIT_CONVENIO": "Em execução", "VL_GLOBAL_CONV": "100,00"}, "pagamentos": []},
    )
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(
            numero,
            {"SIT_CONVENIO": "Em execução", "VL_GLOBAL_CONV": "150,00"},
            {"siconv_pagamento": [{"NR_MOV_FIN": "1", "VL_PAGO": "10,50"}]},
        ),
    )
    job.run()
    db.expire_all()
    assert _avisos(db, instrumento_id) == []
    convenio = db.query(Convenio).filter_by(numero=numero).one()
    assert convenio.siconv_raw["_espelho"]["versao"] == 1
    assert convenio.siconv_raw["pagamentos"][0]["NR_MOV_FIN"] == "1"
    assert float(convenio.valor_pago_fornecedor) == 10.5 and convenio.pagamentos_count == 1
    assert float(convenio.valor_global) == 150
    captura = db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id, FonteCaptura.fonte == "siconv_legado").one()
    assert captura.detalhes["cargas_iniciais"] == 1
    assert captura.detalhes["diferencas_absorvidas_na_carga_inicial"] >= 2


def test_mudancas_depois_da_baseline_geram_um_aviso_agrupado_e_sao_idempotentes(cenario, monkeypatch):
    numero, db, _ = cenario
    instrumento_id = _criar(
        db,
        numero,
        {
            "_espelho": {"versao": 1},
            "convenio": {"SIT_CONVENIO": "Em execução", "VL_GLOBAL_CONV": "100,00"},
            "pagamentos": [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}],
            "empenhos": [{"ID_EMPENHO": "7", "VALOR_EMPENHO": "5,00"}],
        },
    )
    filhas = {
        "siconv_pagamento": [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}, {"NR_MOV_FIN": "2", "VL_PAGO": "20,00"}],
        "siconv_empenho": [{"ID_EMPENHO": "7", "VALOR_EMPENHO": "6,00"}],
    }
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(numero, {"SIT_CONVENIO": "Prestação de Contas Concluída", "VL_GLOBAL_CONV": "100,00"}, filhas),
    )
    job.run()
    db.expire_all()
    avisos = _avisos(db, instrumento_id)
    assert len(avisos) == 1
    assert "Pagamentos: 1 novo(s)" in (avisos[0].corpo or "")
    assert "Empenhos: 1 alterado(s)" in (avisos[0].corpo or "")
    assert "VALOR_EMPENHO: 5,00 → 6,00" in (avisos[0].corpo or "")
    assert "SIT_CONVENIO" in (avisos[0].corpo or "")
    convenio = db.query(Convenio).filter_by(numero=numero).one()
    assert float(convenio.valor_pago_fornecedor) == 30 and convenio.pagamentos_count == 2

    job.run()
    db.expire_all()
    assert len(_avisos(db, instrumento_id)) == 1


def test_tabela_filha_indisponivel_preserva_dado_e_marca_parcial(cenario, monkeypatch):
    numero, db, ultimo_id = cenario
    _criar(
        db,
        numero,
        {
            "_espelho": {"versao": 1},
            "convenio": {"SIT_CONVENIO": "Em execução"},
            "pagamentos": [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}],
        },
    )
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(numero, {"SIT_CONVENIO": "Em execução"}, {"siconv_pagamento": TimeoutError("sem resposta")}),
    )
    job.run()
    db.expire_all()
    convenio = db.query(Convenio).filter_by(numero=numero).one()
    assert convenio.siconv_raw["pagamentos"] == [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}]
    captura = db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id, FonteCaptura.fonte == "siconv_legado").one()
    assert captura.status == "parcial"
    assert "siconv_pagamento" in captura.detalhes["tabelas_com_falha"][0]


def test_item_que_a_fonte_deixou_de_devolver_nao_e_apagado(cenario, monkeypatch):
    numero, db, _ = cenario
    instrumento_id = _criar(
        db,
        numero,
        {
            "_espelho": {"versao": 1},
            "convenio": {"SIT_CONVENIO": "Em execução"},
            "pagamentos": [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}, {"NR_MOV_FIN": "2", "VL_PAGO": "5,00"}],
        },
    )
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(
            numero, {"SIT_CONVENIO": "Em execução"}, {"siconv_pagamento": [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}]}
        ),
    )
    job.run()
    db.expire_all()
    convenio = db.query(Convenio).filter_by(numero=numero).one()
    assert [p["NR_MOV_FIN"] for p in convenio.siconv_raw["pagamentos"]] == ["1", "2"]
    assert _avisos(db, instrumento_id) == []


@pytest.mark.parametrize("chave", [*job.FILHAS, job.ITENS[0]])
def test_cada_tabela_filha_notifica_campos_alterados_e_preserva_omitidos(cenario, monkeypatch, chave):
    numero, db, _ = cenario
    arquivo, coluna, rotulo = job.FILHAS.get(chave, ("siconv_plano_aplicacao", job.ITENS[1], job.ITENS[2]))
    anterior = {coluna: "1", "DESCRICAO": "Anterior", "CAMPO_OMITIDO": "Preservado"}
    if chave == "pagamentos":
        anterior["VL_PAGO"] = "10,00"
    instrumento_id = _criar(
        db,
        numero,
        {
            "_espelho": {"versao": 1},
            "convenio": {"SIT_CONVENIO": "Em execução"},
            chave: [anterior],
        },
    )
    novo = {coluna: "1", "DESCRICAO": "Atualizada"}
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(
            numero,
            {
                "SIT_CONVENIO": "Em execução",
                "ID_PROPOSTA": "123",
            },
            {arquivo: [novo]},
        ),
    )
    if chave == job.ITENS[0]:
        monkeypatch.setattr(
            job, "_filtrar_plano_aplicacao_por_id_proposta", lambda *a, **k: [{"ID_PROPOSTA": "123", **novo}]
        )

    job.run()
    db.expire_all()

    avisos = _avisos(db, instrumento_id)
    assert len(avisos) == 1
    assert rotulo in avisos[0].corpo
    assert "DESCRICAO: Anterior → Atualizada" in avisos[0].corpo
    assert db.query(Convenio).filter_by(numero=numero).one().siconv_raw[chave][0]["CAMPO_OMITIDO"] == "Preservado"
    job.run()
    db.expire_all()
    assert len(_avisos(db, instrumento_id)) == 1


@pytest.mark.parametrize(
    "pagamentos",
    [
        [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}, {"NR_MOV_FIN": "1", "VL_PAGO": "20,00"}],
        [{"VL_PAGO": "10,00"}],
        [{"NR_MOV_FIN": "1", "VL_PAGO": "inválido"}],
    ],
)
def test_captura_invalida_reverte_toda_transacao_e_registra_falha(cenario, monkeypatch, pagamentos):
    numero, db, ultimo_id = cenario
    original = {
        "_espelho": {"versao": 1},
        "convenio": {"SIT_CONVENIO": "Em execução"},
        "pagamentos": [{"NR_MOV_FIN": "1", "VL_PAGO": "10,00"}],
    }
    instrumento_id = _criar(db, numero, original)
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(
            numero,
            {
                "SIT_CONVENIO": "Prestação de Contas Concluída",
            },
            {"siconv_pagamento": pagamentos},
        ),
    )

    with pytest.raises(ValueError):
        job.run()
    db.expire_all()

    convenio = db.query(Convenio).filter_by(numero=numero).one()
    assert convenio.situacao == "Em execução"
    assert convenio.siconv_raw == original
    assert (
        db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).one().situacao_prestacao_contas == "Em execução"
    )
    assert _avisos(db, instrumento_id) == []
    captura = db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id, FonteCaptura.fonte == "siconv_legado").one()
    assert captura.status == "erro"
