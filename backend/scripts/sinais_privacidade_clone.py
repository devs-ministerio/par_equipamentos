"""Detecção conservadora, não certificado de anonimato nem sanitizador."""

import re
import unicodedata

from pydantic import JsonValue

from scripts.proteger_clone_local import CPF, EMAIL, TELEFONE, TOKEN_URL

MARCADORES = frozenset(
    {
        "[dado pessoal protegido]",
        "[pessoa física protegida]",
        "[identificador pessoal protegido]",
        "[telefone protegido]",
        "[protegido]",
        "contato-local@example.com",
    }
)
CHAVES_PESSOAIS = frozenset(
    {
        "cpf",
        "email",
        "telefone",
        "celular",
        "contato",
        "senha",
        "password",
        "token",
        "representante",
        "responsavel",
        "depositante",
        "ip",
        "useragent",
    }
)


def sinais_texto(valor: str) -> set[str]:
    sinais = set()
    if any(
        m.group() != "contato-local@example.com" and not re.fullmatch(r"usuario-local-[0-9]+@example\.com", m.group())
        for m in EMAIL.finditer(valor)
    ):
        sinais.add("email")
    if CPF.search(valor):
        sinais.add("cpf_formatado")
    if TELEFONE.search(valor):
        sinais.add("telefone_formatado")
    if any(m.group()[len(m.group(1)) :] != "[protegido]" for m in TOKEN_URL.finditer(valor)):
        sinais.add("segredo_em_url")
    return sinais


def sinais_payload(valor: JsonValue) -> set[str]:
    if isinstance(valor, str):
        return sinais_texto(valor)
    if isinstance(valor, list):
        return set().union(*(sinais_payload(item) for item in valor))
    if isinstance(valor, dict):
        sinais = set()
        for chave, item in valor.items():
            normalizada = "".join(c for c in unicodedata.normalize("NFKD", chave).casefold() if c.isalnum())
            protegido = (
                item is None
                or item == ""
                or isinstance(item, str)
                and (
                    item in MARCADORES
                    or re.fullmatch(
                        r"usuario-local-[0-9]+@example\.com|Pessoa local [a-f0-9]{10}|Usuário local [0-9]+", item
                    )
                    is not None
                )
            )
            if normalizada in CHAVES_PESSOAIS and not protegido:
                sinais.add("campo_pessoal_sem_marcador")
            sinais.update(sinais_payload(item))
        return sinais
    return set()
