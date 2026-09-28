"""scripts/complementar_persus_fontes_extras.py -- matcher de nome de
hospital (regra de negócio pura, sem DB) usado pras 3 fontes adicionais de
complementação do PERSUS I. Sem cobertura de teste até agora (achado ao
vivo 2026-09-27, auditoria de conformidade)."""

from __future__ import annotations

from app.db.models import Convenio
from scripts.complementar_persus_fontes_extras import _melhor_candidato_por_nome


def _convenio(
    numero: str, nome: str, uf: str, *, tipologia: str | None = None, valor_global: float | None = None
) -> Convenio:
    return Convenio(numero=numero, convenente_nome=nome, uf=uf, tipologia=tipologia, valor_global=valor_global)


def test_nome_exato_bate_direto():
    pool = [_convenio("1", "Hospital Erasto Gaertner", "PR"), _convenio("2", "Outro Hospital", "SP")]
    achado = _melhor_candidato_por_nome("Hospital Erasto Gaertner", "PR", pool)
    assert achado is not None and achado.numero == "1"


def test_uf_diferente_nunca_casa():
    pool = [_convenio("1", "Hospital Erasto Gaertner", "PR")]
    assert _melhor_candidato_por_nome("Hospital Erasto Gaertner", "SP", pool) is None


def test_substring_bate_quando_unico():
    # Achado ao vivo -- "Hospital Norte Paranaense" (aba Pagamentos) vs
    # "Hospital Norte Paranaense HONPAR" (nome real no convênio).
    pool = [_convenio("1", "Hospital Norte Paranaense HONPAR", "PR")]
    achado = _melhor_candidato_por_nome("Hospital Norte Paranaense", "PR", pool)
    assert achado is not None and achado.numero == "1"


def test_similaridade_textual_com_folga_minima():
    # Erro de digitação real achado ao vivo -- "Guaratinguetá" vs "Guarantinguetá".
    pool = [_convenio("1", "Santa Casa de Misericórdia de Guarantinguetá", "SP")]
    achado = _melhor_candidato_por_nome("Santa Casa de Misericórdia de Guaratinguetá", "SP", pool)
    assert achado is not None and achado.numero == "1"


def test_ambiguidade_sem_desempate_devolve_none():
    pool = [
        _convenio("1", "Casa de Saúde Santa Marcelina", "SP", tipologia="A", valor_global=5585603.80),
        _convenio("2", "Casa de Saúde Santa Marcelina", "SP", tipologia="EO", valor_global=2970478.12),
    ]
    assert _melhor_candidato_por_nome("Casa de Saúde Santa Marcelina", "SP", pool) is None


def test_ambiguidade_desempatada_por_tipologia():
    # Achado ao vivo -- Apresentação PER-SUS.xlsx tem 2 linhas "Casa de Saúde
    # Santa Marcelina" (tipologia A e EO); só bate com o Convenio certo
    # quando a tipologia da planilha é informada.
    pool = [
        _convenio("1", "Casa de Saúde Santa Marcelina", "SP", tipologia="A", valor_global=5585603.80),
        _convenio("2", "Casa de Saúde Santa Marcelina", "SP", tipologia="EO", valor_global=2970478.12),
    ]
    achado = _melhor_candidato_por_nome("Casa de Saúde Santa Marcelina", "SP", pool, tipologia="EO")
    assert achado is not None and achado.numero == "2"


def test_ambiguidade_desempatada_por_valor_quando_tipologia_nao_resolve():
    pool = [
        _convenio("1", "Casa de Saúde Santa Marcelina", "SP", tipologia="A", valor_global=5585603.80),
        _convenio("2", "Casa de Saúde Santa Marcelina", "SP", tipologia="A", valor_global=2970478.12),
    ]
    achado = _melhor_candidato_por_nome("Casa de Saúde Santa Marcelina", "SP", pool, valor=2970478.12)
    assert achado is not None and achado.numero == "2"


def test_sem_uf_busca_universo_inteiro():
    # Aba "Fiscalização" não tem coluna de UF -- uf=None busca em tudo.
    pool = [_convenio("1", "Hospital Erasto Gaertner", "PR")]
    achado = _melhor_candidato_por_nome("Hospital Erasto Gaertner", None, pool)
    assert achado is not None and achado.numero == "1"


def test_nome_sem_relacao_nenhuma_devolve_none():
    pool = [_convenio("1", "Hospital Erasto Gaertner", "PR")]
    assert _melhor_candidato_por_nome("Reajustes", "PR", pool) is None
