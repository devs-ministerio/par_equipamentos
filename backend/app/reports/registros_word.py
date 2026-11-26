"""Registros completos agrupados em colunas legíveis no Word."""

from collections.abc import Sequence

from app.reports.docx_tabelado import SecaoTabela

_INSTRUMENTOS = (
    ("Identificação", ("Instrumento", "CNES", "Estabelecimento de Saúde", "CNPJ do Convenente", "Município", "UF", "Região")),
    ("Instrumento", ("Contratação", "Situação (Site)", "Situação (Monitoramento)", "Nº do Processo", "Ano do Instrumento",
                     "Início da Vigência", "Fim da Vigência")),
    ("Equipamentos", ("Equipamentos", "Qtd Planejada", "Qtd Entregue", "Qtd em Operação", "% Entregue")),
    ("Datas e inauguração", ("Data de Publicação", "Data do Último Repasse", "Data de Entrega do Equipamento",
                             "Data de Inauguração", "Data de Conclusão do Monitoramento", "Status da Inauguração")),
    ("Valores", ("Valor Global", "Valor Repassado")),
    ("Acompanhamento", ("Técnico Responsável", "Técnico Suplente", "Nível de Monitoramento", "Responsável pela Execução",
                        "Contato", "Ações abertas", "Última Movimentação")),
)
_PROPOSTAS = (
    ("Proposta", ("Nº da Proposta", "Data da Proposta", "Dias desde a Proposta")),
    ("Proponente", ("Proponente", "CNPJ do Proponente", "CNES", "Município", "UF", "Região")),
    ("Programa e objeto", ("Programa", "Componente", "Equipamento", "Objeto")),
    ("Situação e valor", ("Situação da Proposta", "Status da Revisão", "Valor Global da Proposta")),
)


def registros_word(titulo: str, tipo: str, colunas: Sequence[str], linhas: Sequence[Sequence[str]]) -> SecaoTabela:
    grupos = _INSTRUMENTOS if tipo == "instrumentos" else _PROPOSTAS
    pesos = (2.2, 2.2, 1.7, 2.2, 1.35, 2.1) if tipo == "instrumentos" else (1.35, 2.3, 3.3, 1.75)
    indices = {coluna: colunas.index(coluna) for _, campos in grupos for coluna in campos}
    registros = [
        tuple("\n".join(f"{c}: {linha[indices[c]]}" for c in campos if linha[indices[c]] not in ("", "—"))
              for _, campos in grupos)
        for linha in linhas
    ]
    return SecaoTabela(titulo, tuple(rotulo for rotulo, _ in grupos), registros, pesos_colunas=pesos)
