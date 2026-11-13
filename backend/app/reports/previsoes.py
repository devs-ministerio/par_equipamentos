"""Apresentação de conclusão e previsões na planilha e no documento institucional."""

from datetime import datetime, timezone
from typing import Literal

from app.reports import docx_builder, xlsx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados
from app.reports.formatacao import formatar_data
from app.schemas_relatorios_previsoes import RegistroPrevisao
from app.services.relatorios_previsoes import ExtracaoPrevisoes

COLUNAS = [
    "UF",
    "Município",
    "Instituição",
    "Nº do instrumento",
    "Tipo de contratação",
    "Fase atual",
    "Situação de conclusão",
    "Conclusão efetiva",
    "Inauguração realizada",
    "Previsão de inauguração",
    "Dias até a previsão",
]
_DATAS = ["Conclusão efetiva", "Inauguração realizada", "Previsão de inauguração"]
_COLUNAS_WORD = [
    "Instituição",
    "Município/UF",
    "Nº do instrumento",
    "Situação de conclusão",
    "Conclusão",
    "Inauguração",
    "Previsão",
    "Dias",
]
_PESOS_WORD = [3.2, 2.0, 1.6, 2.8, 1.3, 1.3, 1.3, 0.8]
_NOTA = (
    "Uma linha por instrumento em monitoramento interno. Data em branco significa que não há registro: "
    "nada é inferido. Dias até a previsão só existem para previsão ainda não realizada."
)


def _linha(i: RegistroPrevisao) -> list[object]:
    return [
        i.uf,
        i.municipio,
        i.convenente,
        i.instrumento,
        i.tipo,
        i.fase_atual,
        i.situacao,
        i.data_conclusao,
        i.inauguracao_real,
        i.previsao_inauguracao,
        i.dias_ate_previsao,
    ]


def _linha_word(i: RegistroPrevisao) -> list[str]:
    def data(valor) -> str:
        return formatar_data(valor) if valor else "—"

    return [
        i.convenente,
        f"{i.municipio or '—'}/{i.uf or '—'}",
        i.instrumento,
        i.situacao,
        data(i.data_conclusao),
        data(i.inauguracao_real),
        data(i.previsao_inauguracao),
        str(i.dias_ate_previsao) if i.dias_ate_previsao is not None else "—",
    ]


def gerar_extracao(extracao: ExtracaoPrevisoes, *, formato: Literal["xlsx", "docx"], recorte: str) -> bytes:
    if formato == "xlsx":
        pasta = xlsx_builder.nova_pasta()
        xlsx_builder.escrever_aba_tabela(
            pasta,
            "Critérios",
            ["Campo", "Descrição"],
            [["Recorte", recorte], ["Instrumentos", len(extracao.itens)], ["Leitura", _NOTA]],
        )
        xlsx_builder.escrever_aba_tabela(
            pasta,
            "Resumo por situação",
            ["Situação", "Quantidade"],
            [[c.rotulo, c.quantidade] for c in extracao.contagens],
        )
        xlsx_builder.escrever_aba_tabela(
            pasta, "Conclusão e previsões", COLUNAS, [_linha(i) for i in extracao.itens], colunas_data=_DATAS
        )
        return xlsx_builder.gerar_bytes(pasta)
    documento = docx_builder.novo_documento("Conclusão e previsões", paisagem=True)
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo(documento, f"Recorte: {recorte}. {len(extracao.itens)} instrumentos.")
    return gerar_bytes_tabelados(
        documento,
        [
            SecaoTabela(
                "Resumo por situação",
                ["Situação", "Quantidade"],
                [[c.rotulo, str(c.quantidade)] for c in extracao.contagens],
            ),
            SecaoTabela(
                "Conclusão e previsões",
                _COLUNAS_WORD,
                [_linha_word(i) for i in extracao.itens],
                pesos_colunas=_PESOS_WORD,
                fonte_pt=9,
            ),
        ],
    )
