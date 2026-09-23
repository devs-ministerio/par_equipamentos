"""Catálogo e classificação canônica de equipamentos financiados.

Este módulo é a única regra de classificação permitida para ingestão e API.
Ele identifica a evidência textual; a decisão de elegibilidade continua no
registro persistido por meio de ``tipo_evidencia`` e ``relacao``.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from hashlib import sha256
from typing import Literal

RelacaoEquipamento = Literal["aquisicao", "modernizacao", "existente", "mencao"]


@dataclass(frozen=True)
class EquipamentoCatalogado:
    codigo: str
    nome: str
    prioritario: bool
    padrao: re.Pattern[str]


CATALOGO_EQUIPAMENTOS: tuple[EquipamentoCatalogado, ...] = (
    EquipamentoCatalogado(
        "acelerador_linear",
        "Acelerador Linear",
        True,
        re.compile(r"\b(?:ACELERAD(?:OR|O)?(?:\s+(?:LINEAR|LINAC))?|LINAC)\b"),
    ),
    EquipamentoCatalogado("mamografo", "Mamógrafo", True, re.compile(r"MAMOGRAFO")),
    EquipamentoCatalogado("pet_ct", "PET/CT", True, re.compile(r"\bPET[\s/-]*CT\b")),
    EquipamentoCatalogado(
        "gama_camera_spect",
        "Gama-câmara/SPECT",
        True,
        re.compile(r"GAMA\s*CAMARA|CAMARA\s*CINTILOGRAFICA|\bSPECT\b"),
    ),
    EquipamentoCatalogado("braquiterapia", "Braquiterapia", True, re.compile(r"BRAQUITERAPIA")),
    EquipamentoCatalogado("ultrassom", "Ultrassom", False, re.compile(r"ULTRA\s*SS?OM")),
    EquipamentoCatalogado("endoscopia", "Endoscopia", False, re.compile(r"ENDOSCOP")),
    EquipamentoCatalogado("tomografo", "Tomógrafo", False, re.compile(r"TOMOGRAF")),
    EquipamentoCatalogado("ressonancia", "Ressonância", False, re.compile(r"RESSONANC")),
    EquipamentoCatalogado("radioterapia", "Radioterapia", False, re.compile(r"RADIOTERAPIA")),
    EquipamentoCatalogado("raios_x", "Raios X", False, re.compile(r"RAIOS\s*X")),
    EquipamentoCatalogado("hemodialise", "Hemodiálise", False, re.compile(r"HEMODIALISE")),
    EquipamentoCatalogado("angiografia", "Angiografia", False, re.compile(r"ANGIOGRAF")),
    EquipamentoCatalogado("cobalto", "Cobalto", False, re.compile(r"COBALTO")),
    EquipamentoCatalogado(
        "citometro_fluxo",
        "Citômetro de Fluxo",
        False,
        re.compile(r"CITOMETR[OA]\s*DE\s*FLUXO|CITOMETRO"),
    ),
)


@dataclass(frozen=True)
class EvidenciaEquipamento:
    codigo: str
    nome: str
    descricao_original: str
    relacao: RelacaoEquipamento


def normalizar_texto(valor: object) -> str:
    texto = unicodedata.normalize("NFD", str(valor or ""))
    return "".join(char for char in texto if unicodedata.category(char) != "Mn").upper().strip()


def relacao_da_descricao(descricao: str) -> RelacaoEquipamento:
    texto = normalizar_texto(descricao)
    if re.search(r"\b(UPGRADE|MODERNIZAC|ATUALIZAC|SUBSTITUIC)\b", texto):
        return "modernizacao"
    if re.search(r"\b(EXISTENTE|JA INSTALAD|EM USO)\b", texto):
        return "existente"
    return "aquisicao"


def nome_do_item(descricao: str) -> str:
    """Remove somente o código numérico inicial, preservando o nome oficial."""
    return re.sub(r"^\s*\d+\s*-\s*", "", descricao).strip()


def codigo_do_item_generico(descricao: str) -> str:
    normalizado = normalizar_texto(nome_do_item(descricao))
    return f"item_plano_{sha256(normalizado.encode('utf-8')).hexdigest()[:16]}"


def classificar_descricoes(
    descricoes: Iterable[str], *, relacao_padrao: RelacaoEquipamento = "aquisicao"
) -> list[EvidenciaEquipamento]:
    """Retorna uma evidência por equipamento/descrição, sem inferir por CNPJ.

    ``relacao_padrao`` é usado somente quando a fonte já declara que a
    descrição é item de aquisição. Objetos narrativos devem chamar com
    ``mencao`` para não transformar contexto em aquisição.
    """
    evidencias: list[EvidenciaEquipamento] = []
    vistos: set[tuple[str, str]] = set()
    for descricao in descricoes:
        if not descricao or not descricao.strip():
            continue
        texto = normalizar_texto(descricao)
        relacao = relacao_da_descricao(descricao)
        if relacao == "aquisicao":
            relacao = relacao_padrao
        encontrou_catalogado = False
        for equipamento in CATALOGO_EQUIPAMENTOS:
            if not equipamento.padrao.search(texto):
                continue
            encontrou_catalogado = True
            chave = (equipamento.codigo, texto)
            if chave in vistos:
                continue
            vistos.add(chave)
            evidencias.append(
                EvidenciaEquipamento(
                    codigo=equipamento.codigo,
                    nome=equipamento.nome,
                    descricao_original=descricao.strip(),
                    relacao=relacao,
                )
            )
        # Todo item do plano é uma evidência de equipamento. Famílias que não
        # pertencem ao catálogo curado recebem um catálogo derivado, com nome
        # oficial do item e código estável; nunca ficam invisíveis só por não
        # serem prioritárias ou por ainda não terem um alias curado.
        if not encontrou_catalogado and relacao_padrao == "aquisicao":
            nome = nome_do_item(descricao)
            chave = (codigo_do_item_generico(descricao), texto)
            if nome and chave not in vistos:
                vistos.add(chave)
                evidencias.append(
                    EvidenciaEquipamento(
                        codigo=chave[0],
                        nome=nome,
                        descricao_original=descricao.strip(),
                        relacao=relacao,
                    )
                )
    return evidencias


def extrair_descricoes(payload: object, chaves: set[str]) -> list[str]:
    """Extrai apenas campos de item conhecidos de um payload bruto da API."""
    encontradas: list[str] = []

    def visitar(valor: object) -> None:
        if isinstance(valor, dict):
            for chave, interno in valor.items():
                if chave in chaves and isinstance(interno, str):
                    encontradas.append(interno)
                visitar(interno)
        elif isinstance(valor, list):
            for interno in valor:
                visitar(interno)

    visitar(payload)
    return encontradas
