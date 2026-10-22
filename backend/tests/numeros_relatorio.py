"""Leitura do número do instrumento nos blocos do relatório em Word.

O bloco de convênio/programa leva o número no próprio título ("NOME -- Convênio
750170"); a linha "Número:" só existe nos blocos de acompanhamento interno sem
bloco oficial, cujo título traz apenas o nome. Os testes usam estes auxiliares
para não depender de uma das duas formas.
"""

import re

_TIPOS = r"(?:Convênio|FAF|TED|PERSUS I|PERSUS II|PRONON)"
_TITULO = re.compile(rf" -- {_TIPOS} (\S+)$")


def numero_do_bloco(paragrafo) -> str | None:
    if paragrafo.text.startswith("Número: "):
        return paragrafo.text.removeprefix("Número: ")
    if paragrafo.style is not None and paragrafo.style.name == "Heading 3":
        achado = _TITULO.search(paragrafo.text)
        return achado.group(1) if achado else None
    return None


def numeros_dos_blocos(paragrafos) -> list[str]:
    return [numero for p in paragrafos if (numero := numero_do_bloco(p)) is not None]
