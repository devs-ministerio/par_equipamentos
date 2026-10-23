"""Classificação por código RENEM: exata, sem palavra-chave."""

import pytest

from app.equipamentos_renem import (
    FAMILIAS,
    classificar_item,
    extrair_codigo,
    familias_controladas,
    normalizar_codigo,
)


@pytest.mark.parametrize(
    ("descricao", "codigo"),
    [
        ("010925-Mamógrafo Digital", "010925"),
        ("10925 - Mamógrafo", "010925"),
        ("301 - PET CT", "000301"),
        ("CÓD. 10874 TOMOGRAFIA COMPUTADORIZADA 16 CANAIS", "010874"),
        ("Mamógrafo", None),
        ("", None),
    ],
)
def test_extrair_codigo(descricao, codigo):
    assert extrair_codigo(descricao) == codigo


def test_normalizar_codigo_completa_seis_digitos():
    assert normalizar_codigo(277) == "000277"


def test_16_familias_com_codigos_unicos():
    assert len(FAMILIAS) == 16
    codigos = [c for f in FAMILIAS for c in (*f.renem, *(leg.codigo for leg in f.legados))]
    assert len(codigos) == len(set(codigos))
    assert "012005" in codigos  # cirurgia robótica, fora da RENEM de março


@pytest.mark.parametrize(
    ("descricao", "familia", "fonte"),
    [
        ("010925-Mamógrafo Digital", "mamografo", "codigo_oficial"),
        ("000277-Mamógrafo Convencional", "mamografo", "codigo_legado"),
        ("011806-Acelerador Linear (Básico - Intermediário)", "acelerador_linear", "codigo_oficial"),
        ("010933-Acelerador Linear de Fótons e Elétrons (dual 10 MV)", "acelerador_linear", "codigo_legado"),
        ("011422-Ultrassom Diagnóstico sem Aplicação Transesofágica", "ultrassom_sem_transesofagica", "codigo_oficial"),
        ("011804-Tomógrafo Computadorizado (Até 16 canais)", "tomografo_ate_16_canais", "codigo_oficial"),
        ("010874-Tomógrafo Computadorizado (16 Cortes)", "tomografo_ate_16_canais", "codigo_legado"),
        ("000719 - Simulador/ Tomógrafo para Radioterapia", "simulador_tomografo_radioterapia", "codigo_oficial"),
        ("012005-Sistema Cirúrgico Robótico", "cirurgia_robotica", "codigo_legado"),
        ("Mamógrafo", "mamografo", "nome_exato"),
        ("Acelerador Linear", "acelerador_linear", "nome_exato"),
        ("PET CT", "pet_ct", "nome_exato"),
        ("Braquiterapia com sistema de controle remoto", "braquiterapia", "nome_exato"),
        ("ACELERADOR LINEAR DE FÓTONS ELÉTRONS (10 MV)", "acelerador_linear", "nome_inicio"),
        ("Braquiterapia com Sistema de Controle Remoto.", "braquiterapia", "nome_inicio"),
        ("Mamógrafo digital com tomossíntese", "mamografo", "nome_inicio"),
    ],
)
def test_classifica_pelo_codigo_ou_pelo_nome_exato(descricao, familia, fonte):
    resultado = classificar_item(descricao)
    assert (resultado.familia, resultado.fonte) == (familia, fonte)


@pytest.mark.parametrize(
    "descricao",
    [
        "011237-Monitor Multiparâmetros para Ressonância Magnética",  # acessório que cita o equipamento
        "011234-Aparelho de Anestesia para Ressonância Magnética",
        "011045-Carro Maca para Ressonância Magnética",
        "000398-Lavadora de Endoscópio",
        "011423-Ultrassom Diagnóstico com Aplicação Transesofágica",  # outra variante
        "011805-Tomógrafo Computadorizado (Acima de 16 canais até 80 canais)",
        "010875-Tomógrafo Computadorizado (64 Cortes)",
        "010400-Sistema de Vídeo Endoscopia",  # ambíguo: nem flexível nem rígida
        "Monitor Multiparâmetros para Ressonância Magnética",  # sem código, nome não começa pela família
        "No-Break (Para Mamógrafo)",
        "Lavadora de Endoscópio",
        "Tomógrafo Computadorizado",  # sem faixa de canais: ambíguo
        "Ultrasom + Mamógrafo",
        "011422-Ultrassom Diagnóstico sem Aplicação Transesofágica + 010925-Mamógrafo",
        "",
    ],
)
def test_nao_classifica_acessorios_variantes_e_textos_com_dois_equipamentos(descricao):
    assert classificar_item(descricao).familia is None


def test_itens_com_dois_equipamentos_ficam_como_multiplo():
    assert classificar_item("Ultrasom + Mamógrafo").fonte == "multiplo"


def test_familias_controladas_inclui_as_16():
    assert len(familias_controladas()) == 16
