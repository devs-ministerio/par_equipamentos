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
RELACOES_FINANCIAMENTO = frozenset({"aquisicao", "modernizacao"})


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
        re.compile(r"\b(?:ACELERAD(?:OR|O)?\s+(?:LINEAR|LINAC)|LINAC)\b"),
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
    # Natureza explícita da descrição prevalece sobre aliases citados nela.
    # Um item misto permanece conservador: aquisição precisa de evidência
    # separada por item, não de uma palavra solta numa narrativa da obra.
    if descricao_de_obra_ou_servico(descricao):
        return "mencao"
    if re.search(r"\b(UPGRADE|MODERNIZAC|ATUALIZAC|SUBSTITUIC)\b", texto):
        return "modernizacao"
    if re.search(r"\b(EXISTENTE|JA INSTALAD|EM USO)\b", texto):
        return "existente"
    return "aquisicao"


def descricao_de_obra_ou_servico(descricao: str) -> bool:
    """Identifica natureza explícita; não decide apenas por 'hospital'."""
    texto = normalizar_texto(descricao)
    obra = re.search(
        r"\b(?:OBRAS?\s+(?:DE\s+)?(?:CONSTRUCAO|REFORMA|AMPLIACAO)|"
        r"(?:CONSTRUCAO|REFORMA|AMPLIACAO)\s+(?:DO|DA|DE)\s+(?:HOSPITAL|UNIDADE|PREDIO)|"
        r"(?:EXECUCAO|CONTRATACAO)\s+(?:DAS?\s+)?OBRAS?|AREA\s+CONSTRUIDA)\b",
        texto,
    )
    servico = re.search(
        r"\b(?:PRESTACAO\s+DE\s+SERVICOS?|CONTRATACAO\s+(?:DE\s+)?(?:SERVICOS?|EMPRESA))\b",
        texto,
    )
    return bool(obra or servico or descricao_de_formacao_ou_incentivo(descricao))


def descricao_de_formacao_ou_incentivo(descricao: str) -> bool:
    """Distingue o objeto financiado de treinamento acessório à aquisição.

    Curso que menciona equipamento continua serviço, mesmo que sua ementa
    cite compra. Equipamento adquirido com treinamento incluso continua bem.
    Sem evidência explícita de aquisição, formação é conservada como menção.
    """
    texto = normalizar_texto(nome_do_item(descricao))
    formacao = r"(?:CURSOS?|CAPACITAC(?:AO|OES)|TREINAMENTOS?|OFICINAS?|SEMINARIOS?|FORMACAO)"
    objeto_formativo = re.match(
        rf"(?:(?:REALIZACAO|OFERTA|EXECUCAO|CONTRATACAO|AQUISICAO)\s+(?:DE\s+)?)?{formacao}\b",
        texto,
    )
    incentivo = re.search(r"\b(?:CONSULTORIA|CAPITAL\s+SEMENTE|EMPREENDEDOR(?:ES|ISMO)?)\b", texto)
    tem_formacao = re.search(rf"\b{formacao}\b", texto)
    aquisicao_equipamento = re.search(
        r"\b(?:AQUISICAO|COMPRA|FORNECIMENTO)\s+(?:(?:DE|DO|DA)\s+)?"
        r"(?:(?:UM|UMA)\s+)?(?:EQUIPAMENTOS?|APARELHOS?|ACELERADOR(?:ES)?\s+LINEAR(?:ES)?|"
        r"LINAC|MAMOGRAFOS?|PET[\s/-]*CT|GAMA[\s-]*CAMARA|SPECT)\b",
        texto,
    )
    equipamento_com_formacao = any(e.padrao.match(texto) for e in CATALOGO_EQUIPAMENTOS) and re.search(
        rf"\b(?:COM|INCLUINDO)\s+(?:{formacao})\b", texto
    )
    return bool(
        objeto_formativo or incentivo or (tem_formacao and not (aquisicao_equipamento or equipamento_com_formacao))
    )


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
    item_de_plano = relacao_padrao == "aquisicao"
    for descricao in descricoes:
        if not descricao or not descricao.strip():
            continue
        texto = normalizar_texto(descricao)
        relacao = relacao_da_descricao(descricao)
        if relacao == "aquisicao":
            relacao = relacao_padrao
        trechos = _trechos_do_item(descricao) if item_de_plano else [descricao]
        for trecho in trechos:
            evidencias.extend(_evidencias_do_trecho(descricao, trecho, texto, relacao, item_de_plano, vistos))
    return evidencias


def _trechos_do_item(descricao: str) -> list[str]:
    """Item de plano que junta equipamentos ("A + B") vale um marcador por equipamento."""
    trechos = [t.strip() for t in re.split(r"\s\+\s", descricao) if t.strip()]
    return trechos if len(trechos) > 1 else [descricao]


def _cabecalho_do_item(trecho: str) -> str:
    """Nome do item: o que vem antes da especificação técnica (": ", " - ", quebra de linha)."""
    nome = nome_do_item(trecho)
    nome = re.sub(r"^\s*(?:C[OÓ]D\.?\s*\d+|\d+\))\s*", "", nome, flags=re.IGNORECASE)
    cabecalho = re.split(r"\s[-–]\s|:|[\n\t]", nome)[0].strip()
    # "Equipamento existente: mamógrafo": sem equipamento antes do separador, o nome vem depois.
    if any(e.padrao.search(normalizar_texto(cabecalho)) for e in CATALOGO_EQUIPAMENTOS):
        return cabecalho
    return nome


def _evidencias_do_trecho(
    descricao: str,
    trecho: str,
    texto: str,
    relacao: RelacaoEquipamento,
    item_de_plano: bool,
    vistos: set[tuple[str, str]],
) -> list[EvidenciaEquipamento]:
    from app.classificacao_itens import classificar  # import tardio: classificacao_itens importa este módulo
    from app.equipamentos_renem import FAMILIAS, classificar_item  # import tardio: evita ciclo

    evidencias: list[EvidenciaEquipamento] = []
    # Famílias com controle por unidade: o código RENEM do item (ou o nome exato) decide, e
    # nenhuma palavra-chave genérica soma evidência ao mesmo item.
    classificacao = classificar_item(trecho)
    if classificacao.familia is not None:
        familia = next(f for f in FAMILIAS if f.catalogo_codigo == classificacao.familia)
        chave = (familia.catalogo_codigo, texto)
        if chave not in vistos:
            vistos.add(chave)
            evidencias.append(
                EvidenciaEquipamento(
                    codigo=familia.catalogo_codigo,
                    nome=familia.nome_catalogo or familia.nome_oficial,
                    descricao_original=descricao.strip(),
                    relacao=relacao,
                )
            )
        return evidencias
    # Palavra-chave só vale para o equipamento que o item é, nunca para o que ele menciona
    # ("Monitor ... para Ressonância", "Rendimento ... do mamógrafo"): o motor de classificação
    # decide a natureza do item e o nome do item (antes da especificação) limita a busca.
    texto_busca = texto
    acessorio = False
    if item_de_plano:
        resultado = classificar(trecho)
        if resultado.tipo not in ("aquisicao", "multiplo", "acessorio_insumo"):
            return evidencias
        acessorio = resultado.tipo == "acessorio_insumo"
        if acessorio and relacao == "mencao":
            return evidencias
        texto_busca = "" if acessorio else normalizar_texto(_cabecalho_do_item(trecho))
    achados = [(m.start(), e) for e in CATALOGO_EQUIPAMENTOS if (m := e.padrao.search(texto_busca))]
    if item_de_plano and achados:
        # "Acelerador Linear para radioterapia": o que vem depois de "para" é destino, não o item.
        itens = [(i, e) for i, e in achados if not re.search(r"\bPARA\s+$", texto_busca[:i])]
        achados = itens or achados
        # PET/CT é um tomógrafo: a menção mais específica fica com o marcador.
        if any(e.codigo == "pet_ct" for _, e in achados):
            achados = [(i, e) for i, e in achados if e.codigo != "tomografo"]
    for _, equipamento in achados:
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
    # Itens sem natureza explícita de serviço podem gerar evidência. Famílias que não
    # pertencem ao catálogo curado recebem um catálogo derivado, com nome
    # oficial do item e código estável; nunca ficam invisíveis só por não
    # serem prioritárias ou por ainda não terem um alias curado.
    cita_catalogado = any(e.padrao.search(texto) for e in CATALOGO_EQUIPAMENTOS)
    if not achados and item_de_plano and relacao != "mencao" and (acessorio or not cita_catalogado):
        nome = nome_do_item(trecho)
        chave = (codigo_do_item_generico(trecho), texto)
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
