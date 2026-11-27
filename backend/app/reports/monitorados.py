"""Formatação da mesma extração que alimenta a prévia de Relatórios."""

from collections.abc import Sequence
from typing import Literal

from app.reports import docx_builder, xlsx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados
from app.reports.equipamentos_fichas import fichas_equipamentos
from app.reports.registros_word import fichas_instrumentos, fichas_propostas
from app.services.relatorios_filtro import Nivel
from app.services.relatorios_modelo import Celula, RelatorioMonitorado

_DATAS = ("Publicação", "Entrega", "Inauguração", "Conclusão", "Data de entrega")


def _datas(relatorio: RelatorioMonitorado) -> list[str]:
    return [*_DATAS, *relatorio.colunas_data]


def _linhas_tabela(
    colunas: Sequence[str],
    linhas: Sequence[Sequence[Celula]],
    *,
    colunas_data: Sequence[str] = (),
    colunas_moeda: Sequence[str] = (),
) -> list[list[str]]:
    textos = docx_builder.linhas_como_texto(colunas, linhas, colunas_data=colunas_data, colunas_moeda=colunas_moeda)
    for original, texto in zip(linhas, textos, strict=True):
        for indice, coluna in enumerate(colunas):
            if coluna in colunas_moeda and original[indice] is None:
                texto[indice] = ""
    return textos


def _cabecalho_resumo(relatorio: RelatorioMonitorado, recorte: str) -> list[list[Celula]]:
    if relatorio.cabecalho:
        return [list(c) for c in relatorio.cabecalho]
    rotulo = "Fases" if relatorio.unidade == "instrumentos" else "Situações"
    resumo: list[list[Celula]] = [["Recorte", recorte], ["Total", relatorio.total], ["Unidade", relatorio.unidade]]
    if relatorio.criterios:
        resumo.append([rotulo, ", ".join(relatorio.criterios)])
    return resumo


def _xlsx(r: RelatorioMonitorado, recorte: str) -> bytes:
    pasta = xlsx_builder.nova_pasta()
    blocos = [
        xlsx_builder.BlocoAba(None, [r.titulo, ""], _cabecalho_resumo(r, recorte)),
        *(
            [xlsx_builder.BlocoAba("Indicadores", ["Indicador", "Valor"], [list(i) for i in r.indicadores])]
            if r.indicadores
            else []
        ),
        *(xlsx_builder.BlocoAba(q.titulo, q.colunas, q.linhas, colunas_moeda=q.colunas_moeda) for q in r.quebras),
    ]
    xlsx_builder.escrever_aba_blocos(pasta, "Resumo", blocos)
    rodape: list[list[Celula]] = []
    if r.legenda:
        rodape.append(["Legenda", ""])
        for coluna, texto in r.legenda:
            rodape.append([coluna, texto])
    xlsx_builder.escrever_aba_tabela(
        pasta,
        r.aba_registros,
        list(r.colunas),
        r.linhas,
        colunas_data=_datas(r),
        colunas_moeda=list(r.colunas_moeda),
        rodape=rodape,
    )
    for aba in r.abas:
        xlsx_builder.escrever_aba_tabela(
            pasta,
            aba.titulo,
            list(aba.colunas),
            aba.linhas,
            colunas_data=list(aba.colunas_data),
            colunas_moeda=list(aba.colunas_moeda),
        )
    return xlsx_builder.gerar_bytes(pasta)


def _registros_equipamentos_simplificados(r: RelatorioMonitorado) -> SecaoTabela:
    linhas = []
    textos = _linhas_tabela(r.colunas, r.linhas, colunas_data=_datas(r), colunas_moeda=r.colunas_moeda)
    for originais, valores in zip(r.linhas, textos, strict=True):
        campos = {
            coluna: texto if original is not None else ""
            for coluna, original, texto in zip(r.colunas, originais, valores, strict=True)
        }

        def rotulo(nome: str, coluna: str) -> str:
            valor = campos[coluna]
            return f"{nome}: {valor}" if valor else ""

        municipio_uf = " / ".join(filter(None, (campos["Município"], campos["UF"])))
        linhas.append(
            [
                campos["Instrumento"],
                "\n".join(filter(None, (campos["Estabelecimento de Saúde"], rotulo("CNES", "CNES")))),
                "\n".join(filter(None, (municipio_uf, campos["Região"]))),
                campos["Equipamento"],
                "\n".join(
                    filter(
                        None,
                        (
                            campos["Situação (Equipamento)"],
                            rotulo("Site", "Situação (Site)"),
                            rotulo("Monitoramento", "Situação (Monitoramento)"),
                        ),
                    )
                ),
                campos["Qtd"],
                campos["Valor do Equipamento"],
                "\n".join(
                    filter(
                        None,
                        (
                            rotulo("Entrega", "Data de Entrega do Equipamento"),
                            rotulo("Previsão/Inauguração", "Data de Previsão/Inauguração"),
                            rotulo("Status", "Status da Inauguração"),
                        ),
                    )
                ),
                campos["Técnico Responsável"],
            ]
        )
    return SecaoTabela(
        "Registros de equipamentos",
        (
            "Instrumento",
            "Estabelecimento",
            "Local",
            "Equipamento",
            "Situação",
            "Qtd",
            "Valor",
            "Entrega e inauguração",
            "Técnico responsável",
        ),
        linhas,
        pesos_colunas=(1.25, 2.7, 1.75, 1.75, 2.65, 0.65, 1.4, 2.7, 1.7),
    )


def _docx(r: RelatorioMonitorado, recorte: str, nivel: Nivel) -> bytes:
    cabecalho = dict(r.cabecalho)
    referencia = cabecalho.get("Referência")
    fonte = cabecalho.get("Fonte")
    documento = docx_builder.novo_documento(r.titulo, paisagem=True)
    equipamentos = r.arquivo_base == "equipamentos"
    docx_builder.adicionar_cabecalho_institucional(documento)
    quando = f"Em {referencia}, " if referencia else ""
    unidade = r.unidade
    if equipamentos:
        unidade = "equipamento" if r.total == 1 else "equipamentos"
    docx_builder.adicionar_paragrafo(documento, f"{quando}{r.total} {unidade} no recorte {recorte}.")
    if filtros := cabecalho.get("Filtros"):
        docx_builder.adicionar_paragrafo(documento, f"Filtros: {filtros}.")
    if r.criterios:
        rotulo = "Fases" if r.unidade == "instrumentos" else "Situações"
        docx_builder.adicionar_paragrafo(documento, f"{rotulo}: {', '.join(r.criterios)}.")
    if not equipamentos:
        for rotulo_indicador, valor in r.indicadores:
            docx_builder.adicionar_paragrafo(documento, f"{rotulo_indicador}: {'—' if valor is None else valor}.")
    secoes: list[SecaoTabela] = []
    if r.quebras:
        q = r.quebras[0]
        secoes.append(
            SecaoTabela(
                q.titulo,
                q.colunas,
                _linhas_tabela(q.colunas, q.linhas, colunas_moeda=q.colunas_moeda, colunas_data=q.colunas_data),
            )
        )
    # Sem síntese (modelo ainda sem quebras), a tabela de registros é o único conteúdo.
    if equipamentos and nivel == "completo":
        secoes.extend(fichas_equipamentos(r))
    elif equipamentos:
        secoes.append(_registros_equipamentos_simplificados(r))
    elif nivel == "completo" and r.arquivo_base in ("instrumentos", "propostas"):
        textos = _linhas_tabela(r.colunas, r.linhas, colunas_data=_datas(r), colunas_moeda=r.colunas_moeda)
        if r.arquivo_base == "instrumentos":
            secoes.extend(fichas_instrumentos(r, textos))
        else:
            secoes.extend(fichas_propostas(r.colunas, textos))
    elif nivel == "completo" or not r.quebras:
        secoes.append(
            SecaoTabela(
                r.titulo,
                r.colunas,
                _linhas_tabela(r.colunas, r.linhas, colunas_data=_datas(r), colunas_moeda=r.colunas_moeda),
            )
        )
    docx_builder.adicionar_fonte(documento, fonte or "SISGEO")
    if not secoes:
        docx_builder.adicionar_logotipo_final(documento)
        return docx_builder.gerar_bytes(documento)
    return gerar_bytes_tabelados(documento, secoes)


def gerar_monitorados(
    relatorio: RelatorioMonitorado,
    *,
    formato: Literal["xlsx", "docx"],
    recorte: str,
    nivel: Nivel = "simplificado",
) -> bytes:
    if formato == "xlsx":
        return _xlsx(relatorio, recorte)
    return _docx(relatorio, recorte, nivel)
