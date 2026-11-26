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
_COLUNAS_EQUIPAMENTO = ("Equipamento", "Qtd a entregar", "Qtd entregue", "Em operação\n(dos entregues)", "Valor unitário")
_PESOS_INSTRUMENTO = (4.3, 1.1, 1.1, 1.55, 1.95)
_ALINHAMENTOS_EQUIPAMENTO = (
    WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER,
    WD_ALIGN_PARAGRAPH.RIGHT,
)
_PROPOSTAS = (
    ("Proposta", ("Nº da Proposta", "Data da Proposta", "Dias desde a Proposta")),
    ("Proponente", ("Proponente", "CNPJ do Proponente", "CNES", "Município", "UF", "Região")),
    ("Programa e objeto", ("Programa", "Componente", "Equipamento", "Objeto")),
    ("Situação e valor", ("Situação da Proposta", "Status da Revisão", "Valor Global da Proposta")),
)


def _campos_rotulados(registro: dict[str, str], campos: Sequence[str], separador: str) -> str:
    return separador.join(f"{c}: {registro[c]}" for c in campos if registro[c] not in ("", "—"))


def fichas_instrumentos(relatorio: RelatorioMonitorado, linhas: Sequence[Sequence[str]]) -> list[SecaoTabela]:
    if not linhas:
        return [SecaoTabela("Fichas dos instrumentos", _COLUNAS_EQUIPAMENTO, [], pesos_colunas=_PESOS_INSTRUMENTO)]
    fichas = []
    for linha in linhas:
        registro = dict(zip(relatorio.colunas, linha, strict=True))
        dados: list[tuple[str | int, ...]] = []
        titulos: set[int] = set()
        totais: frozenset[int] = frozenset()
        mesclas = {0: (1, 4)}
        for titulo, campos in _CABECALHO_INSTRUMENTO:
            valores = [(campo, registro[campo]) for campo in campos if registro[campo] not in ("", "—")]
            if valores:
                titulos.add(len(dados))
                mesclas[len(dados) + 1] = (0, 4)
                dados.append((titulo, "", "", "", ""))
                for campo, valor in valores:
                    mesclas[len(dados) + 1] = (1, 4)
                    dados.append((campo, valor, "", "", ""))

        titulos.add(len(dados))
        mesclas[len(dados) + 1] = (0, 4)
        dados.append(("Equipamentos", "", "", "", ""))
        equipamentos = relatorio.equipamentos_por_instrumento.get(registro["Instrumento"], [])
        if equipamentos:
            titulos.add(len(dados))
            dados.append(_COLUNAS_EQUIPAMENTO)
            dados.extend(
                (e.nome, e.a_entregar, e.entregues, e.em_operacao,
                 formatar_moeda(e.valor_unitario) if e.valor_unitario is not None else "")
                for e in equipamentos
            )
            if len(equipamentos) > 1:
                totais = frozenset({len(dados)})
                dados.append(("Total", registro["Qtd a Entregar"], registro["Qtd Entregue"],
                              registro["Qtd em Operação"], ""))
        else:
            mesclas[len(dados) + 1] = (0, 4)
            dados.append(("Nenhum equipamento neste recorte.", "", "", "", ""))
        contratacao = registro["Contratação"]
        prefixo = contratacao if contratacao not in ("", "—") else "Instrumento"
        fichas.append(SecaoTabela(
            f"{prefixo} - {registro['Instrumento']}", ("Campo", "Informação", "", "", ""), dados,
            pesos_colunas=_PESOS_INSTRUMENTO, linhas_de_secao=frozenset(titulos), mesclas=mesclas,
            alinhamentos=_ALINHAMENTOS_EQUIPAMENTO, linhas_de_total=totais,
        ))
    return fichas


def registros_propostas_word(titulo: str, colunas: Sequence[str], linhas: Sequence[Sequence[str]]) -> SecaoTabela:
    registros = []
    for linha in linhas:
        registro = dict(zip(colunas, linha, strict=True))
        registros.append(tuple(_campos_rotulados(registro, campos, "\n") for _, campos in _PROPOSTAS))
    return SecaoTabela(titulo, tuple(rotulo for rotulo, _ in _PROPOSTAS), registros,
                      pesos_colunas=(1.35, 2.3, 3.3, 1.75))
