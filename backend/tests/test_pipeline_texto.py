"""app/pipeline/texto.py -- normalização/parsing de texto usados em toda a
ingestão manual (PERSUS, SICONV bulk). Sem cobertura de teste até agora
(achado ao vivo 2026-09-27, auditoria de conformidade)."""

from __future__ import annotations

from app.pipeline.texto import capitalizar_nome, normalizar_texto, parsear_valor_brasileiro


def test_normalizar_texto_remove_acento_e_padroniza_maiuscula():
    assert normalizar_texto("São Paulo") == "SAO PAULO"
    assert normalizar_texto("  Blumenau  ") == "BLUMENAU"
    assert normalizar_texto(None) == ""


def test_capitalizar_nome_title_case():
    assert capitalizar_nome("SÃO PAULO") == "São Paulo"
    assert capitalizar_nome("blumenau") == "Blumenau"
    assert capitalizar_nome(None) is None
    assert capitalizar_nome("") == ""


def test_parsear_valor_brasileiro_virgula_decimal_sem_milhar():
    # Achado ao vivo 2026-09-27, convênio 922037: SICONV bulk usa vírgula
    # decimal sem separador de milhar -- "5928266,99" quebrava com float() cru.
    assert parsear_valor_brasileiro("5928266,99") == 5928266.99
    assert parsear_valor_brasileiro("5430000") == 5430000.0


def test_parsear_valor_brasileiro_com_prefixo_e_milhar():
    # Controle PERSUS.xlsx, aba Obras -- "R$ Projeto + reajuste": "R$ 73.804,18"
    assert parsear_valor_brasileiro("R$ 73.804,18") == 73804.18
    assert parsear_valor_brasileiro("R$ 3.209.367,30") == 3209367.30


def test_parsear_valor_brasileiro_numerico_nativo_passa_direto():
    assert parsear_valor_brasileiro(5430000) == 5430000.0
    assert parsear_valor_brasileiro(73804.18) == 73804.18


def test_parsear_valor_brasileiro_vazio_ou_invalido_e_none():
    assert parsear_valor_brasileiro(None) is None
    assert parsear_valor_brasileiro("") is None
    assert parsear_valor_brasileiro("pendente") is None
    assert parsear_valor_brasileiro("A conferir") is None
