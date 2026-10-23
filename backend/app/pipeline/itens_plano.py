"""Quais itens do plano de aplicação do SICONV contam como equipamento.

`TIPO_DESPESA_ITEM` separa `BEM` de `OBRA`/`SERVICO`. Nesses dois últimos a
descrição apenas menciona equipamentos e `QTD_ITEM` é área ou serviço (por exemplo
38.447 m²), nunca unidades; o valor é da obra. Obras não fazem parte do SIGEO, então
esses itens ficam na fonte (evidência e baseline da recaptura), mas não entram em
equipamento, quantidade nem valor dos relatórios.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

TIPOS_FORA_DO_EQUIPAMENTO = frozenset({"OBRA", "SERVICO"})


def item_conta_como_equipamento(item: Any) -> bool:
    """Item sem tipo (carga manual de PERSUS, FAF, TED) conta como equipamento."""
    if not isinstance(item, dict):
        return False
    tipo = str(item.get("TIPO_DESPESA_ITEM") or "").strip().upper()
    return tipo not in TIPOS_FORA_DO_EQUIPAMENTO


def descricoes_so_de_obra_ou_servico(itens: Iterable[Any]) -> frozenset[str]:
    """Descrições que só aparecem em itens de obra/serviço, nunca num item de bem."""
    lista = [i for i in itens if isinstance(i, dict) and i.get("DESCRICAO_ITEM")]
    de_bem = {i["DESCRICAO_ITEM"] for i in lista if item_conta_como_equipamento(i)}
    de_obra = {i["DESCRICAO_ITEM"] for i in lista if not item_conta_como_equipamento(i)}
    return frozenset(de_obra - de_bem)
