"""Fichas do Word Completo de Equipamentos, a partir dos registros da prévia."""

from app.reports.docx_builder import linhas_como_texto
from app.reports.docx_tabelado import SecaoTabela
from app.services.relatorios_modelo import RelatorioMonitorado

_COLUNAS = ("Equipamento e item do plano", "Situação", "Qtd", "Valor", "Entrega", "Inauguração", "Identificação técnica")
_PESOS = (3.5, 1.8, 0.55, 1.45, 1.2, 1.7, 2.45)


def _rotulo(nome: str, valor: str) -> str:
    return f"{nome}: {valor}" if valor else ""


def _detalhes(campos: dict[str, str]) -> list[tuple[str, str]]:
    municipio_uf = " / ".join(filter(None, (campos["Município"], campos["UF"])))
    detalhes = (
        ("Estabelecimento", (
            campos["Estabelecimento de Saúde"], _rotulo("CNES", campos["CNES"]),
            municipio_uf, _rotulo("Região", campos["Região"]),
        )),
        ("Instrumento", (
            campos["Contratação"], _rotulo("Processo", campos["Nº do Processo"]), _rotulo("Ano", campos["Ano do Instrumento"]),
            _rotulo("Início da vigência", campos["Início da Vigência"]), _rotulo("Fim da vigência", campos["Fim da Vigência"]),
        )),
        ("Acompanhamento", (
            _rotulo("Situação (Site)", campos["Situação (Site)"]),
            _rotulo("Situação (Monitoramento)", campos["Situação (Monitoramento)"]),
            _rotulo("Técnico responsável", campos["Técnico Responsável"]),
        )),
    )
    return [(nome, " · ".join(filter(None, valores))) for nome, valores in detalhes if any(valores)]


def _linha_equipamento(campos: dict[str, str]) -> tuple[str, ...]:
    equipamento = campos["Equipamento"]
    descricao = campos["Descrição do item no plano"]
    if descricao and descricao != equipamento:
        equipamento = "\n".join(filter(None, (equipamento, descricao)))
    return (
        equipamento,
        campos["Situação (Equipamento)"],
        campos["Qtd"],
        campos["Valor do Equipamento"],
        campos["Data de Entrega do Equipamento"],
        "\n".join(filter(None, (campos["Data de Previsão/Inauguração"], campos["Status da Inauguração"]))),
        "\n".join(filter(None, (
            _rotulo("Marca", campos["Marca"]), _rotulo("Modelo", campos["Modelo"]), _rotulo("Série", campos["Série"]),
        ))),
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
    return [
        SecaoTabela(
            f"Instrumento {numero}", _COLUNAS, [_linha_equipamento(campos) for campos in linhas],
            pesos_colunas=_PESOS, detalhes=_detalhes(linhas[0]),
        )
        for numero, linhas in grupos.items()
    ]
