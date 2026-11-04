"""Apresentação dos equipamentos entregues na planilha e no documento institucional."""

from datetime import datetime, timezone
from typing import Literal

from app.reports import docx_builder, xlsx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados
from app.reports.formatacao import formatar_data
from app.schemas_relatorios_entregues import RegistroEntregue
from app.services.relatorios_entregues import ExtracaoEntregues

COLUNAS = [
    "UF",
    "Município",
    "Instituição",
    "CNES",
    "Nº do instrumento",
    "Tipo de contratação",
    "Equipamento",
    "Nº da unidade",
    "Marca",
    "Modelo",
    "Número de série",
    "Vida útil (anos)",
    "Data de entrega",
]
_COLUNAS_WORD = [
    "Instituição",
    "Município/UF",
    "Nº do instrumento",
    "Equipamento",
    "Un.",
    "Marca",
    "Modelo",
    "Nº de série",
    "Vida útil",
    "Entrega",
]
_PESOS_WORD = [3.0, 2.0, 1.6, 2.6, 0.6, 1.4, 1.6, 1.6, 0.9, 1.5]
_NOTA = (
    "Uma linha por unidade de equipamento entregue, registrada no monitoramento por item e unidade. "
    "Instrumentos sem controle por unidade não aparecem."
)


def _linha(item: RegistroEntregue) -> list[object]:
    return [
        item.uf,
        item.municipio,
        item.convenente,
        item.cnes,
        item.instrumento,
        item.tipo,
        item.item,
        item.ordem,
        item.marca,
        item.modelo,
        item.numero_serie,
        item.vida_util_anos,
        item.data_entrega,
    ]


def _linha_word(item: RegistroEntregue) -> list[str]:
    return [
        item.convenente,
        f"{item.municipio or '—'}/{item.uf or '—'}",
        item.instrumento,
        item.item,
        str(item.ordem),
        item.marca or "—",
        item.modelo or "—",
        item.numero_serie or "—",
        f"{item.vida_util_anos} anos" if item.vida_util_anos is not None else "—",
        formatar_data(item.data_entrega),
    ]


def gerar_extracao(extracao: ExtracaoEntregues, *, formato: Literal["xlsx", "docx"], recorte: str) -> bytes:
    if formato == "xlsx":
        pasta = xlsx_builder.nova_pasta()
        xlsx_builder.escrever_aba_tabela(
            pasta,
            "Critérios",
            ["Campo", "Descrição"],
            [["Recorte", recorte], ["Unidades entregues", len(extracao.itens)], ["Leitura", _NOTA]],
        )
        xlsx_builder.escrever_aba_tabela(
            pasta,
            "Equipamentos entregues",
            COLUNAS,
            [_linha(i) for i in extracao.itens],
            colunas_data=["Data de entrega"],
        )
        return xlsx_builder.gerar_bytes(pasta)
    documento = docx_builder.novo_documento("Equipamentos entregues", paisagem=True)
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo(documento, f"Recorte: {recorte}. {len(extracao.itens)} unidades entregues.")
    return gerar_bytes_tabelados(
        documento,
        [
            SecaoTabela(
                "Equipamentos entregues",
                _COLUNAS_WORD,
                [_linha_word(i) for i in extracao.itens],
                pesos_colunas=_PESOS_WORD,
                fonte_pt=9,
            )
        ],
    )
