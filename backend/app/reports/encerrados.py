"""Apresentação da mesma extração na planilha e no documento institucional."""

from datetime import datetime, timezone
from typing import Literal

from app.reports import docx_builder, xlsx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados
from app.reports.formatacao import formatar_data, formatar_moeda
from app.schemas_relatorios_encerrados import RegistroEncerrado
from app.services.relatorios_encerrados import ExtracaoEncerrados

COLUNAS = [
    "UF",
    "Município",
    "Instituição",
    "CNES",
    "Nº do convênio",
    "Equipamento(s)",
    "Quantidade",
    "Tipo de contratação",
    "Valor global",
    "Data de conclusão",
    "Origem da data",
    "Critério",
    "Evidência",
    "Situação carteira/proposta",
    "Situação monitoramento",
    "Situação SICONV",
]

_COLUNAS_WORD = [
    "Instituição",
    "Município/UF",
    "CNES",
    "Nº do convênio",
    "Equipamento(s)",
    "Qtd.",
    "Tipo",
    "Valor global",
    "Data de conclusão",
    "Critério",
]
_PESOS_WORD = [3.2, 1.8, 1.2, 1.6, 2.6, 0.7, 1.4, 1.9, 1.6, 2.2]

_NOTA_DATA = (
    "Data de conclusão: a registrada no monitoramento interno; na falta dela, o fim da vigência do "
    "instrumento, indicado como tal. O SICONV não informa a data em que a prestação de contas foi concluída."
)
_NOTA_QUANTIDADE = (
    "Quantidade: unidades dos equipamentos do instrumento, pela soma da quantidade dos itens do plano de "
    "aplicação; sem plano de aplicação (PERSUS, FAF, TED), conta uma unidade por tipo de equipamento."
)
_LIMITE = (
    "Ordem paga não comprova quitação integral da parceria ou conclusão física. Pendências não integram os concluídos."
)
_PRECEDENCIA = "Prestação de contas concluída; conclusão interna com data; parceria confirmada com ordem Paga."


def _linha(item: RegistroEncerrado) -> list[object]:
    return [
        item.uf,
        item.municipio,
        item.nome,
        item.cnes,
        item.numero,
        item.equipamentos or None,
        item.quantidade,
        item.tipo,
        item.valor_global,
        item.data_referencia,
        item.origem_data,
        item.motivo,
        item.evidencia,
        item.situacao_carteira,
        item.situacao_monitoramento,
        item.situacao_oficial,
    ]


def _data_word(item: RegistroEncerrado) -> str:
    if item.data_referencia is None:
        return "—"
    texto = formatar_data(item.data_referencia)
    return texto if item.origem_data != "Fim da vigência" else f"{texto}\n(fim da vigência)"


def _linha_concluido_word(item: RegistroEncerrado) -> list[str]:
    return [
        item.nome,
        f"{item.municipio or '—'}/{item.uf or '—'}",
        item.cnes or "—",
        item.numero,
        item.equipamentos or "—",
        str(item.quantidade) if item.quantidade is not None else "—",
        item.tipo,
        formatar_moeda(float(item.valor_global)) if item.valor_global is not None else "—",
        _data_word(item),
        item.motivo,
    ]


def _linha_pendencia_word(item: RegistroEncerrado) -> list[str]:
    return [
        item.numero,
        f"{item.nome}\n{item.tipo}\n{item.municipio or '—'}/{item.uf or '—'}",
        f"{item.motivo}\n{item.evidencia}"
        f"\nCarteira: {item.situacao_carteira or '—'}; Monitoramento: {item.situacao_monitoramento or '—'}; "
        f"SICONV: {item.situacao_oficial or '—'}",
    ]


def gerar_extracao(extracao: ExtracaoEncerrados, *, formato: Literal["xlsx", "docx"], recorte: str) -> bytes:
    if formato == "xlsx":
        pasta = xlsx_builder.nova_pasta()
        xlsx_builder.escrever_aba_tabela(
            pasta,
            "Critérios",
            ["Campo", "Descrição"],
            [
                ["Recorte", recorte],
                ["Concluídos", len(extracao.itens)],
                ["Pendências excluídas", len(extracao.pendencias)],
                ["Precedência", _PRECEDENCIA],
                ["Data de conclusão", _NOTA_DATA],
                ["Quantidade", _NOTA_QUANTIDADE],
                ["Limite", _LIMITE],
            ],
        )
        for titulo, itens in (("Concluídos", extracao.itens), ("Pendências", extracao.pendencias)):
            xlsx_builder.escrever_aba_tabela(
                pasta,
                titulo,
                COLUNAS,
                [_linha(i) for i in itens],
                colunas_moeda=["Valor global"],
                colunas_data=["Data de conclusão"],
            )
        return xlsx_builder.gerar_bytes(pasta)
    # Muitas colunas: página deitada.
    documento = docx_builder.novo_documento("Instrumentos e parcerias concluídos", paisagem=True)
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo(
        documento,
        f"Recorte: {recorte}. {len(extracao.itens)} concluídos; "
        f"{len(extracao.pendencias)} pendências excluídas da relação principal.",
    )
    docx_builder.adicionar_paragrafo(
        documento, f"Precedência: {_PRECEDENCIA} {_NOTA_DATA} {_NOTA_QUANTIDADE} {_LIMITE}"
    )
    return gerar_bytes_tabelados(
        documento,
        [
            SecaoTabela(
                "Concluídos",
                _COLUNAS_WORD,
                [_linha_concluido_word(i) for i in extracao.itens],
                pesos_colunas=_PESOS_WORD,
                fonte_pt=9,
            ),
            SecaoTabela(
                "Pendências",
                ["Número", "Convenente e local", "Motivo e evidência"],
                [_linha_pendencia_word(i) for i in extracao.pendencias],
                pesos_colunas=[1.3, 2.8, 4],
                fonte_pt=10,
            ),
        ],
    )
