"""Registros completos agrupados em colunas legíveis no Word."""

from collections.abc import Sequence

from app.reports.docx_tabelado import SecaoTabela

_CABECALHO_INSTRUMENTO = (
    ("Estabelecimento", ("Estabelecimento de Saúde", "CNES", "CNPJ do Convenente", "Município", "UF", "Região")),
    ("Instrumento", ("Contratação", "Situação (Site)", "Situação (Monitoramento)", "Nº do Processo",
                    "Ano do Instrumento", "Início da Vigência", "Fim da Vigência")),
    ("Acompanhamento", ("Técnico Responsável", "Nível de Monitoramento", "Ações abertas")),
)
_TABELA_INSTRUMENTO = (
    ("Equipamentos", ("Equipamentos",)),
    ("Quantidades", ("Qtd Planejada", "Qtd Entregue", "Qtd em Operação", "% Entregue")),
    ("Datas e inauguração", ("Data de Publicação", "Data do Último Repasse", "Data de Entrega do Equipamento",
                            "Data de Inauguração", "Data de Conclusão do Monitoramento", "Status da Inauguração")),
    ("Valores", ("Valor Global", "Valor Repassado")),
)
_PESOS_INSTRUMENTO = (2.8, 2, 3.3, 2)
_PROPOSTAS = (
    ("Proposta", ("Nº da Proposta", "Data da Proposta", "Dias desde a Proposta")),
    ("Proponente", ("Proponente", "CNPJ do Proponente", "CNES", "Município", "UF", "Região")),
    ("Programa e objeto", ("Programa", "Componente", "Equipamento", "Objeto")),
    ("Situação e valor", ("Situação da Proposta", "Status da Revisão", "Valor Global da Proposta")),
)


def _campos_rotulados(registro: dict[str, str], campos: Sequence[str], separador: str) -> str:
    return separador.join(f"{c}: {registro[c]}" for c in campos if registro[c] not in ("", "—"))


def fichas_instrumentos(colunas: Sequence[str], linhas: Sequence[Sequence[str]]) -> list[SecaoTabela]:
    campos_tabela = tuple(rotulo for rotulo, _ in _TABELA_INSTRUMENTO)
    if not linhas:
        return [SecaoTabela("Fichas dos instrumentos", campos_tabela, [], pesos_colunas=_PESOS_INSTRUMENTO)]
    fichas = []
    for linha in linhas:
        registro = dict(zip(colunas, linha, strict=True))
        detalhes = [
            (rotulo, valor)
            for rotulo, campos in _CABECALHO_INSTRUMENTO
            if (valor := _campos_rotulados(registro, campos, " · "))
        ]
        dados = [tuple(_campos_rotulados(registro, campos, "\n") for _, campos in _TABELA_INSTRUMENTO)]
        fichas.append(SecaoTabela(
            f"Instrumento {registro['Instrumento']}", campos_tabela, dados,
            pesos_colunas=_PESOS_INSTRUMENTO, detalhes=detalhes,
        ))
    return fichas


def registros_propostas_word(titulo: str, colunas: Sequence[str], linhas: Sequence[Sequence[str]]) -> SecaoTabela:
    registros = []
    for linha in linhas:
        registro = dict(zip(colunas, linha, strict=True))
        registros.append(tuple(_campos_rotulados(registro, campos, "\n") for _, campos in _PROPOSTAS))
    return SecaoTabela(titulo, tuple(rotulo for rotulo, _ in _PROPOSTAS), registros,
                      pesos_colunas=(1.35, 2.3, 3.3, 1.75))
