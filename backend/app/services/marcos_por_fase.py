"""Em que fase do acompanhamento cada marco do cronograma pode ser lançado.

A fase é calculada (ver `fase_acompanhamento`); aqui só se decide a disponibilidade do marco nela. Vale para
lançamento novo: corrigir um evento já registrado não passa por esta regra. O frontend espelha a tabela em
`frontend/src/lib/marcos-por-fase.ts`.
"""

from __future__ import annotations

from app.repositories.repasses import CODIGOS_POS_ENTREGA
from app.services.fase_acompanhamento import FaseAcompanhamento

F = FaseAcompanhamento
_ORDEM = list(FaseAcompanhamento)

# Marcos de fabricação e importação: com repasse e antes da entrega.
CODIGOS_AQUISICAO_CRONOGRAMA = (
    "cronograma_inicio_fabricacao",
    "cronograma_fabricacao_concluida",
    "cronograma_chegada_porto",
    "cronograma_desembaraco_aduaneiro",
)
_CODIGOS_OBRA = ("cronograma_obra_inicio", "cronograma_infraestrutura_pronta", "cronograma_obra_fim")

JANELAS: dict[str, tuple[FaseAcompanhamento, FaseAcompanhamento]] = {
    **{c: (F.valor_repassado, F.em_aquisicao) for c in CODIGOS_AQUISICAO_CRONOGRAMA},
    **{c: (F.acompanhamento_iniciado, F.equipamento_entregue) for c in _CODIGOS_OBRA},
    **{c: (F.equipamento_entregue, F.pos_entrega) for c in CODIGOS_POS_ENTREGA},
}


def marco_disponivel_na_fase(codigo: str, fase: FaseAcompanhamento) -> bool:
    janela = JANELAS.get(codigo)
    if janela is None:
        return True
    return _ORDEM.index(janela[0]) <= _ORDEM.index(fase) <= _ORDEM.index(janela[1])


def motivo_indisponivel(codigo: str, fase: FaseAcompanhamento) -> str:
    minima, _ = JANELAS[codigo]
    if fase == F.concluido:
        return "Acompanhamento concluído: reabra-o para lançar este marco."
    if _ORDEM.index(fase) < _ORDEM.index(minima):
        depois = "a entrega" if minima == F.equipamento_entregue else "o repasse"
        return f"Disponível após {depois}. Fase atual: {fase.value}."
    return f"Este marco não é mais lançado nesta fase ({fase.value})."
