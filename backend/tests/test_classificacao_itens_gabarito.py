"""Aderência do motor de classificação ao gabarito revisado pela equipe (77 itens)."""

import json
from pathlib import Path

from app.classificacao_itens import classificar

_ROTULO = {
    "Aquisição": "aquisicao",
    "Complemento/rendimento": "rendimento_aplicacao",
    "Multi-equipamento": "multiplo",
    "Acessório/insumo": "acessorio_insumo",
}


def _gabarito() -> list[dict]:
    caminho = Path(__file__).parent / "fixtures" / "gabarito_classificacao_itens.json"
    return json.loads(caminho.read_text(encoding="utf-8"))


def _resultado(linha: dict):
    solicitacoes = [s["valor"] for s in linha.get("solicitacoes_rendimento") or []]
    return classificar(linha["texto"], valor_total=linha.get("valor_total"), solicitacoes_rendimento=solicitacoes)


def test_tipo_de_lancamento_acima_de_95_por_cento():
    linhas = [x for x in _gabarito() if x.get("tipo_lancamento") in _ROTULO]
    acertos = sum(1 for x in linhas if _resultado(x).tipo == _ROTULO[x["tipo_lancamento"]])
    assert acertos / len(linhas) >= 0.95, f"{acertos}/{len(linhas)}"


# Linha 39 só se distingue de uma aquisição pela revisão humana (texto idêntico ao de um ultrassom comprado).
_SO_REVISAO_HUMANA = {39}


def test_nenhum_rendimento_ou_acessorio_vira_equipamento_com_alta_confianca():
    for x in _gabarito():
        if x["linha"] in _SO_REVISAO_HUMANA:
            continue
        if x.get("tipo_lancamento") in ("Complemento/rendimento", "Acessório/insumo"):
            r = _resultado(x)
            assert not (r.tipo == "aquisicao" and r.conta_unidade and r.confianca == "alta"), x["linha"]
