"""Registros completos agrupados em colunas legíveis no Word."""

from collections.abc import Sequence

from app.reports.docx_tabelado import SecaoTabela
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
_TABELA_INSTRUMENTO = ("Equipamento", "Qtd a entregar", "Qtd entregue", "Dos entregues, em operação")
_PESOS_INSTRUMENTO = (3.7, 1.2, 1.2, 1.8)
_PROPOSTAS = (
    ("Proposta", ("Nº da Proposta", "Data da Proposta", "Dias desde a Proposta")),
    ("Proponente", ("Proponente", "CNPJ do Proponente", "CNES", "Município", "UF", "Região")),
    ("Programa e objeto", ("Programa", "Componente", "Equipamento", "Objeto")),
    ("Situação e valor", ("Situação da Proposta", "Status da Revisão", "Valor Global da Proposta")),
)


def _campos_rotulados(registro: dict[str, str], campos: Sequence[str], separador: str) -> str:
    return separador.join(f"{c}: {registro[c]}" for c in campos if registro[c] not in ("", "—"))


def _formulario_instrumento(registro: dict[str, str]) -> SecaoTabela:
    linhas: list[tuple[str, str]] = []
    titulos: set[int] = set()
    for titulo, campos in _CABECALHO_INSTRUMENTO:
        valores = [(campo, registro[campo]) for campo in campos if registro[campo] not in ("", "—")]
        if valores:
            titulos.add(len(linhas))
            linhas.append((titulo, ""))
            linhas.extend(valores)
    return SecaoTabela(
        f"Instrumento {registro['Instrumento']}", ("Campo", "Informação"), linhas,
        pesos_colunas=(2, 3), linhas_de_secao=frozenset(titulos),
    )


def fichas_instrumentos(relatorio: RelatorioMonitorado, linhas: Sequence[Sequence[str]]) -> list[SecaoTabela]:
    if not linhas:
        return [SecaoTabela("Fichas dos instrumentos", _TABELA_INSTRUMENTO, [], pesos_colunas=_PESOS_INSTRUMENTO)]
    fichas = []
    for linha in linhas:
        registro = dict(zip(relatorio.colunas, linha, strict=True))
        fichas.append(_formulario_instrumento(registro))
        equipamentos = relatorio.equipamentos_por_instrumento.get(registro["Instrumento"], [])
        dados: list[tuple[str | int, ...]] = [
            (e.nome, e.a_entregar, e.entregues, e.em_operacao)
            for e in equipamentos
        ]
        if equipamentos:
            dados.append(("Total", registro["Qtd a Entregar"], registro["Qtd Entregue"], registro["Qtd em Operação"]))
        fichas.append(SecaoTabela(
            "Equipamentos", _TABELA_INSTRUMENTO, dados, pesos_colunas=_PESOS_INSTRUMENTO,
        ))
    return fichas


def registros_propostas_word(titulo: str, colunas: Sequence[str], linhas: Sequence[Sequence[str]]) -> SecaoTabela:
    registros = []
    for linha in linhas:
        registro = dict(zip(colunas, linha, strict=True))
        registros.append(tuple(_campos_rotulados(registro, campos, "\n") for _, campos in _PROPOSTAS))
    return SecaoTabela(titulo, tuple(rotulo for rotulo, _ in _PROPOSTAS), registros,
                      pesos_colunas=(1.35, 2.3, 3.3, 1.75))
