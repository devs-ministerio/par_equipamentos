"""Síntese de conclusões e agenda de previsões (D05): regras puras, sem banco."""

from datetime import date
from types import SimpleNamespace

from app.services.relatorios_conclusao import (
    agenda_dos_instrumentos,
    linhas_agenda,
    proximas_previsoes,
    sintese,
)

HOJE = date(2026, 10, 29)
MARCOS = {
    1: SimpleNamespace(id=1, codigo="fase_concluido"),
    2: SimpleNamespace(id=2, codigo="cronograma_previsao_inauguracao"),
}


def instrumento(id_, fase, nr=None):
    return SimpleNamespace(
        fase_atual=fase,
        instrumento=SimpleNamespace(
            id=id_,
            nr_convenio=nr or f"I{id_}",
            nome_convenente=f"Hospital {id_}",
            municipio="CAMPINAS",
            uf="SP",
            tipo_contratacao="Convênio",
        ),
    )


def evento(marco_id):
    return SimpleNamespace(marco_id=marco_id, data_ocorrencia=None, data_prevista=None)


def dados(**eventos_por_id):
    return SimpleNamespace(marcos=MARCOS, eventos_por_instrumento={int(k[1:]): v for k, v in eventos_por_id.items()})


def montar():
    instrumentos = [
        instrumento(1, "Concluído"),  # concluído completo
        instrumento(2, "Concluído"),  # concluído sem data e sem inauguração
        instrumento(3, "Em licitação"),  # previsão vigente
        instrumento(4, "Em licitação"),  # previsão vencida
        instrumento(5, "Em licitação"),  # sem previsão
        instrumento(6, "Não iniciado"),
    ]
    d = dados(
        e1=[
            SimpleNamespace(marco_id=1, data_ocorrencia=date(2026, 5, 1), data_prevista=None),
            SimpleNamespace(marco_id=2, data_ocorrencia=date(2026, 5, 1), data_prevista=None),
        ],
        e2=[evento(1)],
        e3=[SimpleNamespace(marco_id=2, data_ocorrencia=None, data_prevista=date(2026, 12, 1))],
        e4=[SimpleNamespace(marco_id=2, data_ocorrencia=None, data_prevista=date(2026, 9, 1))],
    )
    return instrumentos, d


def test_cada_instrumento_recebe_a_situacao_correta_sem_inferir_datas():
    instrumentos, d = montar()
    situacoes = [a.situacao for a in agenda_dos_instrumentos(instrumentos, d, HOJE)]
    assert situacoes == [
        "Concluído",
        "Concluído sem data de conclusão e sem inauguração confirmada",
        "Em andamento, previsão vigente",
        "Em andamento, previsão vencida",
        "Em andamento, sem previsão",
        "Não iniciado",
    ]


def test_sintese_conta_lacunas_separadas_de_atraso():
    instrumentos, d = montar()
    valores = {nome: qtd for nome, qtd in sintese(agenda_dos_instrumentos(instrumentos, d, HOJE))}
    assert valores["Instrumentos em monitoramento"] == 6
    assert valores["Concluídos"] == 2
    assert valores["Concluídos com data de conclusão"] == 1
    assert valores["Concluídos sem data de conclusão (lacuna de cadastro)"] == 1
    assert valores["Concluídos sem inauguração confirmada"] == 1
    assert valores["Em andamento com previsão vigente"] == 1
    assert valores["Em andamento com previsão vencida"] == 1
    assert valores["Em andamento sem previsão (lacuna de cadastro)"] == 1
    assert valores["Não iniciados"] == 1


def test_proximas_previsoes_separa_vigentes_de_vencidas_e_ordena_por_data():
    instrumentos, d = montar()
    agenda = agenda_dos_instrumentos(instrumentos, d, HOJE)
    vigentes = proximas_previsoes(agenda, HOJE, vencidas=False)
    vencidas = proximas_previsoes(agenda, HOJE, vencidas=True)
    assert [linha[0] for linha in vigentes] == ["I3"]
    assert vigentes[0][4] == 33  # dias até 01/12/2026
    assert [linha[0] for linha in vencidas] == ["I4"]
    assert vencidas[0][4] < 0


def test_linhas_da_agenda_trazem_as_tres_datas_sem_preencher_o_que_falta():
    instrumentos, d = montar()
    linhas = linhas_agenda(agenda_dos_instrumentos(instrumentos, d, HOJE), HOJE)
    concluido_completo = linhas[0]
    assert concluido_completo[7] == date(2026, 5, 1)  # conclusão efetiva
    assert concluido_completo[8] == date(2026, 5, 1)  # inauguração realizada
    assert concluido_completo[9] is None  # nenhuma previsão inventada
    sem_data = linhas[1]
    assert sem_data[7] is None and sem_data[8] is None and sem_data[9] is None


def test_categoria_de_cada_situacao_e_estavel():
    from app.services.relatorios_conclusao import CATEGORIAS_CONCLUSAO, categoria_da

    instrumentos, d = montar()
    codigos = [categoria_da(a) for a in agenda_dos_instrumentos(instrumentos, d, HOJE)]
    assert codigos == [
        "concluido",
        "concluido_sem_data",
        "previsao_vigente",
        "previsao_vencida",
        "sem_previsao",
        "nao_iniciado",
    ]
    assert set(codigos) <= set(CATEGORIAS_CONCLUSAO)
