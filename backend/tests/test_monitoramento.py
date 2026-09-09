"""Testa `_ao_vivo_de` (app/routers/monitoramento.py) -- sinalizacao de
`valor_suspeito` quando o Portal da Transparencia devolve `valor` (global)
menor que `valorLiberado`, assinatura do bug de truncamento confirmado
nesse campo (ver docstring de ValorSituacaoAoVivoRead) -- e os endpoints de
edicao (PATCH cadastro, POST evento com numero_documento/data_validade,
achados 2026-09-09).

Chama as funcoes do router direto (nao via TestClient -- esse padrao nao
existe no resto do repo, ver test_config_decisions.py) contra o banco real
configurado. `registrar_evento`/`atualizar_cadastro` fazem `db.commit()`
internamente (append-only / PATCH de verdade, nao dado de teste que se
descarta com rollback) -- por isso cada teste que escreve limpa o que
criou/reverte o que mudou no `finally`, pra nao deixar sujeira no banco de
dev compartilhado."""
from datetime import date

import pytest
from fastapi import HTTPException

from app.db.base import SessionLocal
from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from app.routers.monitoramento import (
    EventoMarcoCreate,
    InstrumentoEquipamentoUpdate,
    _ao_vivo_de,
    atualizar_cadastro,
    registrar_evento,
)

NR_CONVENIO_SEED = "948686"  # unico instrumento seedado (scripts/seed_monitoramento.py)


def test_ao_vivo_indisponivel_quando_convenio_nao_encontrado():
    ao_vivo = _ao_vivo_de(None)
    assert ao_vivo.disponivel is False
    assert ao_vivo.valor is None
    assert ao_vivo.valor_suspeito is False


def test_ao_vivo_nao_suspeito_quando_valor_maior_que_liberado():
    # Caso normal: valor global >= valor liberado.
    ao_vivo = _ao_vivo_de({"valor": 9_500_000, "valorLiberado": 9_003_200, "situacao": "EM EXECUÇÃO"})
    assert ao_vivo.disponivel is True
    assert ao_vivo.valor_suspeito is False
    assert ao_vivo.valor == 9_500_000
    assert ao_vivo.situacao == "EM EXECUÇÃO"


def test_ao_vivo_suspeito_quando_valor_truncado():
    # Reproduz o bug real confirmado no convenio 971195 (Santa Casa de
    # Santos): valor global truncado pra 1050 (deveria ser 10.500.000),
    # mas valorLiberado correto (10.499.846) -- liberado > global e
    # logicamente impossivel, sinaliza suspeito.
    ao_vivo = _ao_vivo_de({"valor": 1050, "valorLiberado": 10_499_846, "situacao": "EM EXECUÇÃO"})
    assert ao_vivo.disponivel is True
    assert ao_vivo.valor_suspeito is True
    # Nao tenta "corrigir" o numero -- so sinaliza. O valor cru continua
    # exposto pro chamador decidir o que fazer.
    assert ao_vivo.valor == 1050


def test_ao_vivo_nao_suspeito_quando_valor_liberado_ausente():
    # Sem valorLiberado pra comparar, nao da pra afirmar que e suspeito.
    ao_vivo = _ao_vivo_de({"valor": 1050, "valorLiberado": None, "situacao": "NORMAL"})
    assert ao_vivo.valor_suspeito is False


def test_patch_cadastro_atualiza_so_o_campo_enviado():
    db = SessionLocal()
    try:
        instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).one()
        original_marca = instrumento.equipamento_marca
        original_tecnico = instrumento.tecnico_titular

        resultado = atualizar_cadastro(
            NR_CONVENIO_SEED, InstrumentoEquipamentoUpdate(equipamento_marca="TESTE — apagar"), db,
        )
        assert resultado.equipamento_marca == "TESTE — apagar"
        # PATCH parcial nao pode zerar campo que nao veio no corpo.
        assert resultado.tecnico_titular == original_tecnico
    finally:
        # Sem rollback aqui (o commit do PATCH ja foi pra base) -- reverte
        # de volta ao valor original com outro PATCH de verdade.
        db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).update(
            {"equipamento_marca": original_marca}
        )
        db.commit()
        db.close()


def test_patch_cadastro_nunca_toca_equipamento_descricao():
    """equipamento_descricao e o equipamento PLANEJADO (SICONV) -- nao faz
    parte de InstrumentoEquipamentoUpdate de proposito (decisao do usuario
    2026-09-09: "não vamos alterar o equipamento que veio do SISCONV")."""
    assert "equipamento_descricao" not in InstrumentoEquipamentoUpdate.model_fields


def test_patch_cadastro_convenio_inexistente_404():
    db = SessionLocal()
    try:
        with pytest.raises(HTTPException) as exc:
            atualizar_cadastro("000000", InstrumentoEquipamentoUpdate(equipamento_descricao="x"), db)
        assert exc.value.status_code == 404
    finally:
        db.rollback()  # nada foi escrito (404 antes do commit) -- rollback so por seguranca
        db.close()


def test_registrar_evento_persiste_numero_documento_e_data_validade():
    db = SessionLocal()
    evento_id = None
    try:
        marco_licenca = db.query(MarcoCatalogo).filter_by(codigo="regulatorio_licenca_operacao").one()

        corpo = EventoMarcoCreate(
            marco_id=marco_licenca.id,
            data_ocorrencia=date(2026, 1, 10),
            numero_documento="TESTE-123",
            data_validade=date(2031, 1, 10),
            observacao="Evento de teste -- apagar",
            autor_nome="pytest",
        )
        resultado = registrar_evento(NR_CONVENIO_SEED, corpo, db)
        evento_id = resultado.id
        assert resultado.numero_documento == "TESTE-123"
        assert resultado.data_validade == date(2031, 1, 10)
    finally:
        if evento_id is not None:
            db.query(EventoMarco).filter_by(id=evento_id).delete()
            db.commit()
        db.close()
