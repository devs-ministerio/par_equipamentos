"""Testa `_ao_vivo_de` (app/routers/monitoramento.py) -- sinalizacao de
`valor_suspeito` quando o Portal da Transparencia devolve `valor` (global)
menor que `valorLiberado`, assinatura do bug de truncamento confirmado
nesse campo (ver docstring de ValorSituacaoAoVivoRead)."""
from app.routers.monitoramento import _ao_vivo_de


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
