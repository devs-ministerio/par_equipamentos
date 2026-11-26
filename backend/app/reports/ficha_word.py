"""Tabela de formulário usada nas fichas dos relatórios Word."""

from collections.abc import Sequence

from app.reports.docx_tabelado import SecaoTabela


def montar_ficha(titulo: str, registro: dict[str, str], secoes: Sequence[tuple[str, Sequence[str]]]) -> SecaoTabela:
    linhas: list[tuple[str, str]] = []
    titulos: set[int] = set()
    for rotulo, campos in secoes:
        valores = [(campo, registro[campo]) for campo in campos if registro.get(campo, "") not in ("", "—")]
        if valores:
            titulos.add(len(linhas))
            linhas.append((rotulo, ""))
            linhas.extend(valores)
    return SecaoTabela(
        titulo, ("Campo", "Informação"), linhas, pesos_colunas=(4.3, 5.7),
        linhas_de_secao=frozenset(titulos), mesclas={i + 1: (0, 1) for i in titulos},
    )
