"""Tabelas filhas do SICONV: carga inicial silenciosa, diff agrupado, falhas."""

from uuid import uuid4

import pytest
from sqlalchemy import func
from sqlalchemy.orm import Session, sessionmaker

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


def test_downloads_nao_mantem_transacao_sql_aberta(cenario, monkeypatch):
    # Arrange: só a fábrica de conexão e HTTP, não a regra de domínio.
    numero, db, _ = cenario
    _criar(db, numero)
    sessoes = []

    class SessaoObservada(Session):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            sessoes.append(self)

    monkeypatch.setattr(job, "SessionLocal", sessionmaker(bind=db.get_bind(), class_=SessaoObservada))
    consultar = _fonte(numero, {"SIT_CONVENIO": "Em execução", "ID_PROPOSTA": "123"}, {})

    def baixar(*args, **kwargs):
        assert sessoes and not sessoes[-1].in_transaction()
        return consultar(*args, **kwargs)

    def itens(*args, **kwargs):
        assert not sessoes[-1].in_transaction()
        return []

    monkeypatch.setattr(job, "_filtrar_por_numero_convenio", baixar)
    monkeypatch.setattr(job, "_filtrar_plano_aplicacao_por_id_proposta", itens)
    # Act
    job.run()
    # Assert
    db.expire_all()
    assert db.query(Convenio).filter_by(numero=numero).one().siconv_raw["convenio"]["ID_PROPOSTA"] == "123"
    assert all(not sessao.in_transaction() for sessao in sessoes)


def test_retipificacao_durante_coleta_preserva_decisao_humana(cenario, monkeypatch):
    # Arrange: registro sai do escopo oficial enquanto a fonte é consultada.
    numero, db, _ = cenario
    instrumento_id = _criar(db, numero)
    consultar = _fonte(numero, {"SIT_CONVENIO": "Prestação de Contas Concluída"}, {})

    def baixar(nome, *args, **kwargs):
        if nome == "siconv_convenio":
            db.query(Convenio).filter_by(numero=numero).update({"tipo_contratacao": "TED"})
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).update({"tipo_contratacao": "TED"})
            db.commit()
        return consultar(nome, *args, **kwargs)

    monkeypatch.setattr(job, "_filtrar_por_numero_convenio", baixar)
    # Act
    job.run()
    # Assert
    db.expire_all()
    convenio = db.query(Convenio).filter_by(numero=numero).one()
    instrumento = db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).one()
    assert convenio.tipo_contratacao == instrumento.tipo_contratacao == "TED"
    assert convenio.situacao == instrumento.situacao_prestacao_contas == "Em execução"
    assert convenio.siconv_raw is None and _avisos(db, instrumento_id) == []


@pytest.mark.parametrize("defeito", ["duplicado_igual", "duplicado_divergente", "fora_do_universo"])
def test_cabecalho_ambiguo_nao_sobrescreve_convenio_confirmado(cenario, monkeypatch, defeito):
    # Arrange
    numero, db, ultimo_id = cenario
    original = {"_espelho": {"versao": 1}, "convenio": {"SIT_CONVENIO": "Em execução"}}
    instrumento_id = _criar(db, numero, original)
    registros = [{"NR_CONVENIO": numero, "SIT_CONVENIO": "Prestação de Contas Concluída"}]
    if defeito == "fora_do_universo":
        registros[0]["NR_CONVENIO"] = "convenio-nunca-solicitado"
    else:
        registros.append(
            {
                **registros[0],
                "SIT_CONVENIO": "Em execução" if defeito == "duplicado_divergente" else registros[0]["SIT_CONVENIO"],
            }
        )
    monkeypatch.setattr(job, "_filtrar_por_numero_convenio", lambda *a, **k: registros)
    # Act
    with pytest.raises(ValueError):
        job.run()
    db.expire_all()
    # Assert: duas visões preservadas e nenhuma novidade falsa.
    assert db.query(Convenio).filter_by(numero=numero).one().siconv_raw == original
    assert db.query(Convenio).filter_by(numero=numero).one().situacao == "Em execução"
    assert (
        db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).one().situacao_prestacao_contas == "Em execução"
    )
    assert _avisos(db, instrumento_id) == []
    tentativa = db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id, FonteCaptura.fonte == "siconv_legado").one()
    assert tentativa.status == "erro"


def test_termos_da_mesma_solicitacao_nao_colidem_e_replay_nao_duplica(cenario, monkeypatch):
    # Arrange
    from app.schemas_filhas_legado import TermoRecapturado

    numero, db, _ = cenario
    primeiro = {"ID_SOLICITACAO": "7", "NUMERO_TA": "1", "VL_GLOBAL_TA": "100,00"}
    instrumento_id = _criar(
        db,
        numero,
        {"_espelho": {"versao": 1}, "convenio": {"SIT_CONVENIO": "Em execução"}, "termos_aditivos": [primeiro]},
    )
    novos = [
        {**primeiro, "VL_GLOBAL_TA": "150,00"},
        {"ID_SOLICITACAO": "7", "NUMERO_TA": "2", "VL_GLOBAL_TA": "200,00"},
    ]
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(numero, {"SIT_CONVENIO": "Em execução"}, {"siconv_termo_aditivo": novos}),
    )
    # Act
    job.run()
    job.run()
    db.expire_all()
    # Assert: chave idêntica à usada na recaptura; IDs da fonte não reescritos.
    salvos = db.query(Convenio).filter_by(numero=numero).one().siconv_raw["termos_aditivos"]
    assert [(r["ID_SOLICITACAO"], r["NUMERO_TA"], r["VL_GLOBAL_TA"]) for r in salvos] == [
        ("7", "1", "150,00"),
        ("7", "2", "200,00"),
    ]
    assert [r["CHAVE_ESPELHO"] for r in salvos] == [
        TermoRecapturado.model_validate({"NR_CONVENIO": numero, **r}).CHAVE_ESPELHO for r in novos
    ]
    avisos = _avisos(db, instrumento_id)
    assert len(avisos) == 1
    assert "Termos aditivos: 1 novo(s), 1 alterado(s)" in avisos[0].corpo
    assert "VL_GLOBAL_TA: 100,00 → 150,00" in avisos[0].corpo


def test_termo_sem_solicitacao_usa_numero_oficial_e_preserva_evidencia_antiga(cenario, monkeypatch):
    # Arrange
    numero, db, _ = cenario
    legado = {"JUSTIFICATIVA_TA": "Evidência antiga sem identidade utilizável"}
    _criar(
        db,
        numero,
        {"_espelho": {"versao": 1}, "convenio": {"SIT_CONVENIO": "Em execução"}, "termos_aditivos": [legado]},
    )
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(
            numero, {"SIT_CONVENIO": "Em execução"}, {"siconv_termo_aditivo": [{"NUMERO_TA": "2", "VL_GLOBAL_TA": "0"}]}
        ),
    )
    # Act
    job.run()
    db.expire_all()
    # Assert
    salvos = db.query(Convenio).filter_by(numero=numero).one().siconv_raw["termos_aditivos"]
    assert salvos[0] == legado
    assert salvos[1]["CHAVE_ESPELHO"] == "numero_ta:2"
    assert salvos[1]["VL_GLOBAL_TA"] == "0"


def test_termo_novo_sem_identidade_nao_vira_captura_valida(cenario, monkeypatch):
    # Arrange
    numero, db, ultimo_id = cenario
    original = {"_espelho": {"versao": 1}, "convenio": {"SIT_CONVENIO": "Em execução"}}
    instrumento_id = _criar(db, numero, original)
    monkeypatch.setattr(
        job,
        "_filtrar_por_numero_convenio",
        _fonte(numero, {"SIT_CONVENIO": "Concluído"}, {"siconv_termo_aditivo": [{"VL_GLOBAL_TA": "100"}]}),
    )
    # Act
    with pytest.raises(ValueError, match="identificador oficial"):
        job.run()
    db.expire_all()
    # Assert
    assert db.query(Convenio).filter_by(numero=numero).one().siconv_raw == original
    assert _avisos(db, instrumento_id) == []
    assert (
        db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id, FonteCaptura.fonte == "siconv_legado").one().status
        == "erro"
    )


def test_csv_filho_truncado_preserva_colecao_e_marca_captura_parcial(cenario, monkeypatch):
    # Arrange: parser real; apenas os bytes do download são substituídos.
    from scripts import coletar_siconv_legado as coletor
    from tests.test_coletor_siconv_integridade import zip_siconv

    numero, db, ultimo_id = cenario
    antigos = [{"ID_EMPENHO": "1", "VALOR_EMPENHO": "100,00"}]
    instrumento_id = _criar(
        db, numero, {"_espelho": {"versao": 1}, "convenio": {"SIT_CONVENIO": "Em execução"}, "empenhos": antigos}
    )

    def baixar(nome, *, atualizar_cache=False):
        assert atualizar_cache is True
        if nome == "siconv_convenio":
            return zip_siconv(f"NR_CONVENIO;SIT_CONVENIO\n{numero};Prestação de Contas Concluída\n")
        if nome == "siconv_empenho":
            return zip_siconv(f"NR_CONVENIO;ID_EMPENHO;VALOR_EMPENHO\n{numero};1;200,00\n{numero};2\n")
        return zip_siconv("NR_CONVENIO\n")

    monkeypatch.setattr(coletor, "_baixar_zip", baixar)
    # Act
    job.run()
    db.expire_all()
    # Assert: não publica a primeira linha do arquivo parcialmente corrompido.
    convenio = db.query(Convenio).filter_by(numero=numero).one()
    assert convenio.siconv_raw["empenhos"] == antigos
    assert convenio.situacao == "Prestação de Contas Concluída"
    assert (
        db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).one().situacao_prestacao_contas
        == convenio.situacao
    )
    tentativa = db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id, FonteCaptura.fonte == "siconv_legado").one()
    assert tentativa.status == "parcial"
    assert tentativa.detalhes["tabelas_com_falha"] == ["siconv_empenho (ValueError)"]
    assert len(_avisos(db, instrumento_id)) == 1


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
    if chave == "termos_aditivos":
        coluna = "ID_SOLICITACAO"  # fixture da fonte, sem chave técnica pré-gerada.
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
