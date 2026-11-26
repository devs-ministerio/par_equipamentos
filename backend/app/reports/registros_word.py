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
_TABELA_INSTRUMENTO = ("Equipamento", "Qtd planejada", "Qtd entregue", "Qtd em operação", "% entregue")
_PESOS_INSTRUMENTO = (3.7, 1.2, 1.2, 1.2, 1.1)
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
        return [SecaoTabela("Fichas dos instrumentos", _TABELA_INSTRUMENTO, [], pesos_colunas=_PESOS_INSTRUMENTO)]
    fichas = []
    for linha in linhas:
        registro = dict(zip(relatorio.colunas, linha, strict=True))
        detalhes = [
            (rotulo, valor)
            for rotulo, campos in _CABECALHO_INSTRUMENTO
            if (valor := _campos_rotulados(registro, campos, " · "))
        ]
        equipamentos = relatorio.equipamentos_por_instrumento.get(registro["Instrumento"], [])
        dados: list[tuple[str | int, ...]] = [
            (e.nome, e.planejados, e.entregues, e.em_operacao,
             f"{round(e.entregues / e.planejados * 100)}%" if e.planejados else "")
            for e in equipamentos
        ]
        if equipamentos:
            dados.append(("Total", registro["Qtd Planejada"], registro["Qtd Entregue"], registro["Qtd em Operação"],
                          "" if registro["% Entregue"] == "—" else registro["% Entregue"]))
        fichas.append(SecaoTabela(
            f"Instrumento {registro['Instrumento']}", _TABELA_INSTRUMENTO, dados,
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
