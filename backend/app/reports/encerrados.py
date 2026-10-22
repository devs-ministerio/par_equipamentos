"""Apresentação da mesma extração na planilha e no documento institucional."""

from datetime import datetime, timezone
from typing import Literal

from app.reports import docx_builder, xlsx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados
from app.schemas_relatorios_encerrados import RegistroEncerrado
from app.services.relatorios_encerrados import ExtracaoEncerrados

COLUNAS = [
    "Número",
    "Convenente",
    "Tipo",
    "UF",
    "Município",
    "CNES",
    "Valor global",
    "Motivo",
    "Evidência",
    "Data conclusão interna",
    "Situação carteira/proposta",
    "Situação monitoramento",
    "Situação SICONV",
]


def _linha(item: RegistroEncerrado) -> list[object]:
    return [
        item.numero,
        item.nome,
        item.tipo,
        item.uf,
        item.municipio,
        item.cnes,
        item.valor_global,
        item.motivo,
        item.evidencia,
        item.data_conclusao,
        item.situacao_carteira,
        item.situacao_monitoramento,
        item.situacao_oficial,
    ]


def gerar_extracao(extracao: ExtracaoEncerrados, *, formato: Literal["xlsx", "docx"], recorte: str) -> bytes:
    secoes = [("Encerrados", extracao.itens), ("Pendências", extracao.pendencias)]
    if formato == "xlsx":
        pasta = xlsx_builder.nova_pasta()
        xlsx_builder.escrever_aba_tabela(
            pasta,
            "Critérios",
            ["Campo", "Descrição"],
            [
                ["Recorte", recorte],
                ["Encerrados", len(extracao.itens)],
                ["Pendências excluídas", len(extracao.pendencias)],
                [
                    "Precedência",
                    "Prestação de contas concluída; conclusão interna com data; parceria confirmada com ordem Paga.",
                ],
                [
                    "Limite",
                    "Ordem paga não comprova quitação integral da parceria ou conclusão física. Pendências não integram os encerrados.",
                ],
            ],
        )
        for titulo, itens in secoes:
            xlsx_builder.escrever_aba_tabela(
                pasta,
                titulo,
                COLUNAS,
                [_linha(i) for i in itens],
                colunas_moeda=["Valor global"],
                colunas_data=["Data conclusão interna"],
            )
        return xlsx_builder.gerar_bytes(pasta)
    documento = docx_builder.novo_documento("Instrumentos e parcerias encerrados")
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo(
        documento,
        f"Recorte: {recorte}. {len(extracao.itens)} encerrados; {len(extracao.pendencias)} pendências excluídas da relação principal.",
    )
    docx_builder.adicionar_paragrafo(
        documento,
        "Precedência: prestação de contas concluída; conclusão interna com data; parceria confirmada com ordem Paga. Ordem paga não comprova quitação integral ou conclusão física.",
    )
    return gerar_bytes_tabelados(
        documento,
        [
            SecaoTabela(
                titulo,
                ["Número", "Convenente e local", "Motivo e evidência"],
                [
                    [
                        i.numero,
                        f"{i.nome}\n{i.tipo}\n{i.municipio or '—'}/{i.uf or '—'}",
                        f"{i.motivo}\n{i.evidencia}"
                        + (
                            f"\nCarteira: {i.situacao_carteira or '—'}; Monitoramento: {i.situacao_monitoramento or '—'}; SICONV: {i.situacao_oficial or '—'}"
                            if i.pendencia
                            else ""
                        ),
                    ]
                    for i in itens
                ],
                pesos_colunas=[1.3, 2.8, 4],
                fonte_pt=10,
            )
            for titulo, itens in secoes
        ],
    )
