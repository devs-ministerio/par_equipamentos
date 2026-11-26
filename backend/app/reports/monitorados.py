"""Formatação da mesma extração que alimenta a prévia de Relatórios."""

from datetime import datetime, timezone
from typing import Literal

from app.reports import docx_builder, xlsx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados
from app.services.relatorios_monitorados import Celula, RelatorioMonitorado

_DATAS = ("Publicação", "Entrega", "Inauguração", "Conclusão", "Data de entrega")


def gerar_monitorados(relatorio: RelatorioMonitorado, *, formato: Literal["xlsx", "docx"], recorte: str) -> bytes:
    colunas = list(relatorio.colunas)
    linhas: list[list[Celula]] = [list(linha) for linha in relatorio.linhas]
    total = f"{relatorio.total} {relatorio.unidade}"
    criterios = ", ".join(relatorio.criterios)
    rotulo_criterios = "Fases" if relatorio.unidade == "instrumentos" else "Situações"
    if formato == "xlsx":
        pasta = xlsx_builder.nova_pasta()
        resumo: list[list[Celula]] = [["Recorte", recorte], ["Total", relatorio.total], ["Unidade", relatorio.unidade]]
        if criterios:
            resumo.append([rotulo_criterios, criterios])
        xlsx_builder.escrever_aba_tabela(pasta, "Resumo", ["Campo", "Valor"], resumo)
        xlsx_builder.escrever_aba_tabela(pasta, "Registros", colunas, linhas, colunas_data=[*_DATAS, *relatorio.colunas_data])
        return xlsx_builder.gerar_bytes(pasta)

    documento = docx_builder.novo_documento(relatorio.titulo, paisagem=True)
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo(documento, f"Recorte: {recorte}. {total}.")
    if criterios:
        docx_builder.adicionar_paragrafo(documento, f"{rotulo_criterios}: {criterios}.")
    return gerar_bytes_tabelados(
        documento,
        [SecaoTabela(relatorio.titulo, colunas, docx_builder.linhas_como_texto(colunas, linhas, colunas_data=(*_DATAS, *relatorio.colunas_data)))],
    )
