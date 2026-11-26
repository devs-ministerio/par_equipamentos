"""Registros completos agrupados em colunas legíveis no Word."""

from collections.abc import Sequence

from docx.enum.text import WD_ALIGN_PARAGRAPH

from app.reports.docx_tabelado import SecaoTabela
from app.reports.formatacao import formatar_moeda
from app.services.relatorios_modelo import RelatorioMonitorado

_CABECALHO_INSTRUMENTO = (
    ("Estabelecimento", ("Estabelecimento de Saúde", "CNES", "CNPJ do Convenente", "Município", "UF", "Região")),
    ("Instrumento", ("Contratação", "Situação (Site)", "Situação (Monitoramento)", "Nº do Processo",
                    "Ano do Instrumento", "Início da Vigência", "Fim da Vigência")),
    ("Acompanhamento", ("Técnico Responsável", "Nível de Monitoramento", "Ações abertas")),
    ("Datas e inauguração", ("Data de Publicação", "Data do Último Repasse", "Data de Entrega do Equipamento",
                            "Data de Inauguração", "Data de Conclusão do Monitoramento", "Status da Inauguração")),
    ("Valores", ("Valor Global", "Valor Repassado")),
)
_COLUNAS_EQUIPAMENTO = ("Equipamento", "Qtd Planejado", "Qtd entregue", "Em operação", "Valor unitário")
_PESOS_INSTRUMENTO = (4.3, 1.1, 1.1, 1.55, 1.95)
_ALINHAMENTOS_EQUIPAMENTO = (
    WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER,
    WD_ALIGN_PARAGRAPH.RIGHT,
)
_PROPOSTAS = (
    ("Proposta", ("Data da Proposta", "Dias desde a Proposta")),
    ("Proponente", ("Proponente", "CNPJ do Proponente", "CNES", "Município", "UF", "Região")),
    ("Programa e objeto", ("Programa", "Componente", "Equipamento", "Objeto")),
    ("Situação e valor", ("Situação da Proposta", "Status da Revisão", "Valor Global da Proposta")),
)


def _ficha(titulo: str, registro: dict[str, str], secoes: Sequence[tuple[str, Sequence[str]]]) -> SecaoTabela:
    linhas: list[tuple[str, str]] = []
    titulos: set[int] = set()
    for rotulo, campos in secoes:
        valores = [(campo, registro[campo]) for campo in campos if registro[campo] not in ("", "—")]
        if valores:
            titulos.add(len(linhas))
            linhas.append((rotulo, ""))
            linhas.extend(valores)
    return SecaoTabela(
        titulo, ("Campo", "Informação"), linhas, pesos_colunas=(4.3, 5.7),
        linhas_de_secao=frozenset(titulos), mesclas={i + 1: (0, 1) for i in titulos},
    )


def fichas_instrumentos(relatorio: RelatorioMonitorado, linhas: Sequence[Sequence[str]]) -> list[SecaoTabela]:
    if not linhas:
        return [SecaoTabela("Fichas dos instrumentos", _COLUNAS_EQUIPAMENTO, [], pesos_colunas=_PESOS_INSTRUMENTO)]
    fichas = []
    for linha in linhas:
        registro = dict(zip(relatorio.colunas, linha, strict=True))
        contratacao = registro["Contratação"]
        prefixo = contratacao if contratacao not in ("", "—") else "Instrumento"
        fichas.append(_ficha(f"{prefixo} - {registro['Instrumento']}", registro, _CABECALHO_INSTRUMENTO))

        equipamentos = relatorio.equipamentos_por_instrumento.get(registro["Instrumento"], [])
        dados_equipamentos: list[tuple[str | int, ...]] = [
            (e.nome, e.a_entregar, e.entregues, e.em_operacao,
             formatar_moeda(e.valor_unitario) if e.valor_unitario is not None else "")
            for e in equipamentos
        ]
        totais: frozenset[int] = frozenset()
        if len(equipamentos) > 1:
            totais = frozenset({len(dados_equipamentos)})
            dados_equipamentos.append(("Total", registro["Qtd Planejado"], registro["Qtd Entregue"],
                                       registro["Qtd em Operação"], ""))
        if not equipamentos:
            dados_equipamentos.append(("Nenhum equipamento neste recorte.", "", "", "", ""))
        fichas.append(SecaoTabela(
            "", _COLUNAS_EQUIPAMENTO, dados_equipamentos, pesos_colunas=_PESOS_INSTRUMENTO,
            mesclas={} if equipamentos else {1: (0, 4)},
            alinhamentos=_ALINHAMENTOS_EQUIPAMENTO, linhas_de_total=totais,
        ))
    return fichas


def fichas_propostas(colunas: Sequence[str], linhas: Sequence[Sequence[str]]) -> list[SecaoTabela]:
    if not linhas:
        return [SecaoTabela("Fichas das propostas", ("Campo", "Informação"), [], pesos_colunas=(4.3, 5.7))]
    fichas = []
    for linha in linhas:
        registro = dict(zip(colunas, linha, strict=True))
        fichas.append(_ficha(f"Proposta - {registro['Nº da Proposta']}", registro, _PROPOSTAS))
    return fichas
