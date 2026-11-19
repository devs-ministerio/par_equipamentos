import pytest

from app.services.fase_acompanhamento import FaseAcompanhamento as F
from app.services.marcos_por_fase import marco_disponivel_na_fase, motivo_indisponivel


@pytest.mark.parametrize(
    ("codigo", "fase", "disponivel"),
    [
        ("cronograma_inicio_fabricacao", F.aguardando_repasse, False),
        ("cronograma_inicio_fabricacao", F.valor_repassado, True),
        ("cronograma_chegada_porto", F.em_aquisicao, True),
        ("cronograma_chegada_porto", F.equipamento_entregue, False),
        ("cronograma_obra_inicio", F.acompanhamento_iniciado, True),
        ("cronograma_obra_fim", F.equipamento_entregue, True),
        ("cronograma_obra_fim", F.pos_entrega, False),
        ("cronograma_instalacao_inicio", F.em_aquisicao, False),
        ("cronograma_instalacao_inicio", F.equipamento_entregue, True),
        ("cronograma_inicio_operacao", F.pos_entrega, True),
        ("cronograma_inicio_operacao", F.concluido, False),
        ("cronograma_previsao_inauguracao", F.concluido, True),
    ],
)
def test_janela_do_marco(codigo, fase, disponivel):
    assert marco_disponivel_na_fase(codigo, fase) is disponivel


def test_motivos():
    assert "após a entrega" in motivo_indisponivel("cronograma_treinamento", F.em_aquisicao)
    assert "após o repasse" in motivo_indisponivel("cronograma_inicio_fabricacao", F.acompanhamento_iniciado)
    assert "reabra" in motivo_indisponivel("cronograma_treinamento", F.concluido)
