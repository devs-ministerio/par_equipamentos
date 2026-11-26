"""Fichas do Word Completo de Equipamentos, a partir dos registros da prévia."""

from docx.enum.text import WD_ALIGN_PARAGRAPH

from app.reports.docx_builder import linhas_como_texto
from app.reports.docx_tabelado import SecaoTabela
from app.reports.ficha_word import montar_ficha
from app.services.relatorios_modelo import RelatorioMonitorado

_COLUNAS = ("Equipamento", "Descrição do item do plano", "Situação", "Qtd", "Valor", "Entrega", "Inauguração")
_PESOS = (2.1, 3.85, 1.8, 0.55, 1.45, 1.2, 1.7)


_CABECALHO = (
    ("Estabelecimento", ("Estabelecimento de Saúde", "CNES", "Município", "UF", "Região")),
    ("Instrumento", ("Contratação", "Nº do Processo", "Ano do Instrumento", "Início da Vigência", "Fim da Vigência")),
    ("Acompanhamento", ("Situação (Site)", "Situação (Monitoramento)", "Técnico Responsável")),
)
_ALINHAMENTOS = (
    WD_ALIGN_PARAGRAPH.LEFT,
    WD_ALIGN_PARAGRAPH.LEFT,
    WD_ALIGN_PARAGRAPH.LEFT,
    WD_ALIGN_PARAGRAPH.CENTER,
    WD_ALIGN_PARAGRAPH.RIGHT,
    WD_ALIGN_PARAGRAPH.CENTER,
    WD_ALIGN_PARAGRAPH.LEFT,
)


def _linha_equipamento(campos: dict[str, str]) -> tuple[str, ...]:
    return (
        campos["Equipamento"],
        campos["Descrição do item no plano"],
        campos["Situação (Equipamento)"],
        campos["Qtd"],
        campos["Valor do Equipamento"],
        campos["Data de Entrega do Equipamento"],
        "\n".join(filter(None, (campos["Data de Previsão/Inauguração"], campos["Status da Inauguração"]))),
    )


def fichas_equipamentos(relatorio: RelatorioMonitorado) -> list[SecaoTabela]:
    if not relatorio.linhas:
        return [SecaoTabela("Fichas dos instrumentos", _COLUNAS, [], pesos_colunas=_PESOS)]

    textos = linhas_como_texto(
        relatorio.colunas, relatorio.linhas, colunas_data=relatorio.colunas_data, colunas_moeda=relatorio.colunas_moeda
    )
    grupos: dict[str, list[dict[str, str]]] = {}
    for linha, texto in zip(relatorio.linhas, textos, strict=True):
        campos = {
            coluna: valor if original is not None else ""
            for coluna, original, valor in zip(relatorio.colunas, linha, texto, strict=True)
        }
        grupos.setdefault(campos["Instrumento"], []).append(campos)
    fichas = []
    for numero, linhas in grupos.items():
        registro = linhas[0]
        prefixo = registro["Contratação"] or "Instrumento"
        fichas.append(montar_ficha(f"{prefixo} - {numero}", registro, _CABECALHO))
        fichas.append(
            SecaoTabela(
                "",
                _COLUNAS,
                [_linha_equipamento(campos) for campos in linhas],
                pesos_colunas=_PESOS,
                alinhamentos=_ALINHAMENTOS,
            )
        )
    return fichas
