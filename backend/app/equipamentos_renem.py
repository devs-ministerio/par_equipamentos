"""Famílias de equipamento com controle por unidade e sua classificação por código RENEM.

A RENEM (Relação Nacional de Equipamentos e Materiais Permanentes, FNS) atribui um
código de seis dígitos a cada item (`010925` Mamógrafo). Os itens do plano de aplicação
trazem esse código no início da descrição, e a classificação por código é exata:
palavras soltas erram (um "Monitor Multiparâmetros para Ressonância Magnética" não é
uma ressonância). Por isso este módulo **não** usa palavra-chave: casa pelo código, e só
na falta dele pelo nome exato normalizado.

Funções puras, sem banco. A tabela `renem_item` e o catálogo persistem o mesmo mapa.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from app.equipamentos import nome_do_item, normalizar_texto

FonteClassificacao = Literal[
    "codigo_oficial", "codigo_legado", "nome_exato", "nome_inicio", "multiplo", "nao_classificado"
]


@dataclass(frozen=True)
class CodigoLegado:
    """Código que aparece nos dados mas não consta da RENEM vigente (ou ainda não consta)."""

    codigo: str
    nome: str
    origem: Literal["dados", "usuario"]


@dataclass(frozen=True)
class FamiliaControlada:
    catalogo_codigo: str
    nome_oficial: str
    renem: tuple[str, ...] = ()
    legados: tuple[CodigoLegado, ...] = ()
    sinonimos: tuple[str, ...] = ()
    # Rótulos com que o NOME do item começa (sem código). Só onde o início identifica a família.
    prefixos: tuple[str, ...] = ()
    novo_no_catalogo: bool = False
    nome_catalogo: str | None = None
    nomes_renem: tuple[str, ...] = field(default=(), compare=False)


FAMILIAS: tuple[FamiliaControlada, ...] = (
    FamiliaControlada(
        "mamografo",
        "Mamógrafo (Convencional e Digital)",
        renem=("010925",),
        legados=(CodigoLegado("000277", "Mamógrafo Convencional", "dados"),),
        sinonimos=("Mamógrafo", "Mamógrafo Digital", "Mamógrafo Convencional"),
        prefixos=("Mamógrafo",),
    ),
    FamiliaControlada(
        "colposcopio", "Colposcópio", renem=("000378",), prefixos=("Colposcópio",), novo_no_catalogo=True
    ),
    FamiliaControlada(
        "video_endoscopia_flexivel",
        "Sistema de Vídeo Endoscopia Flexível",
        renem=("011268",),
        novo_no_catalogo=True,
    ),
    FamiliaControlada(
        "video_endoscopia_rigida",
        "Sistema de Vídeo Endoscopia Rígida",
        renem=("010254",),
        novo_no_catalogo=True,
    ),
    FamiliaControlada(
        "endoscopio_rigido",
        "Endoscópio Rígido",
        renem=("000547",),
        prefixos=("Endoscópio Rígido",),
        novo_no_catalogo=True,
    ),
    FamiliaControlada(
        "endoscopio_flexivel",
        "Endoscópio Flexível (Fibroendoscopia)",
        renem=("010138",),
        novo_no_catalogo=True,
    ),
    FamiliaControlada(
        "ultrassom_sem_transesofagica",
        "Ultrassom Diagnóstico sem Aplicação Transesofágica",
        renem=("011422",),
        novo_no_catalogo=True,
    ),
    FamiliaControlada(
        "simulador_tomografo_radioterapia",
        "Simulador/Tomógrafo para Radioterapia",
        renem=("000719",),
        sinonimos=("Simulador/ Tomógrafo para Radioterapia",),
        novo_no_catalogo=True,
    ),
    FamiliaControlada(
        "tomografo_ate_16_canais",
        "Tomógrafo Computadorizado (até 16 canais)",
        renem=("011804",),
        legados=(CodigoLegado("010874", "Tomógrafo Computadorizado (16 Cortes)", "dados"),),
        sinonimos=("Tomógrafo Computadorizado (Até 16 canais)",),
        novo_no_catalogo=True,
    ),
    FamiliaControlada(
        "ressonancia",
        "Ressonância Magnética",
        renem=("010889", "010890", "010891"),
        sinonimos=(
            "Ressonância Nuclear Magnética até 0,5 T",
            "Ressonância Nuclear Magnética 1,5 T",
            "Ressonância Nuclear Magnética 3,0 T",
        ),
        prefixos=("Ressonância Nuclear Magnética", "Ressonância Magnética"),
    ),
    FamiliaControlada(
        "pet_ct",
        "PET-CT",
        renem=("000301",),
        sinonimos=("PET CT", "PET/CT"),
        prefixos=("PET CT", "PET/CT", "PET-CT"),
    ),
    FamiliaControlada(
        "gama_camera_spect",
        "Câmara Cintilográfica (Gama Câmara)",
        renem=("000595",),
        sinonimos=("Câmara Cintilográfica",),
        prefixos=("Câmara Cintilográfica",),
    ),
    FamiliaControlada(
        "acelerador_linear",
        "Acelerador Linear",
        renem=("011806", "011807"),
        legados=(
            CodigoLegado("010933", "Acelerador Linear de Fótons e Elétrons (dual 10 MV)", "dados"),
            CodigoLegado("010911", "Acelerador Linear só de Fótons (monoenergético 6 MV)", "dados"),
            CodigoLegado("010910", "Acelerador Linear de Fótons e Elétrons (dual 15 MV)", "dados"),
        ),
        sinonimos=(
            "Acelerador Linear (Básico - Intermediário)",
            "Acelerador Linear (Recursos avançados com IGRT 3D)",
            "Acelerador Linear de Alta Energia (até 15 MV)",
            "Acelerador Linear de Baixa Energia (até 6 MV)",
        ),
        prefixos=("Acelerador Linear",),
    ),
    FamiliaControlada(
        "braquiterapia",
        "Braquiterapia",
        renem=("010547",),
        sinonimos=("Braquiterapia com sistema de controle remoto",),
        prefixos=("Braquiterapia",),
    ),
    FamiliaControlada(
        "arco_cirurgico", "Arco Cirúrgico", renem=("000253",), prefixos=("Arco Cirúrgico",), novo_no_catalogo=True
    ),
    FamiliaControlada(
        "cirurgia_robotica",
        "Sistema Cirúrgico Robótico (Cirurgia Robótica)",
        legados=(CodigoLegado("012005", "Sistema Cirúrgico Robótico", "usuario"),),
        sinonimos=("Sistema Cirúrgico Robótico",),
        novo_no_catalogo=True,
    ),
)

_CODIGO_INICIAL = re.compile(r"^\s*(?:C[OÓ]D\.?\s*)?0*(\d{3,6})(?=\s*[-–:.]|\s)", re.IGNORECASE)
_LIMITE_TEXTO_COM_MAIS = 160
_CODIGO_EM_QUALQUER_LUGAR = re.compile(r"(?:^|\+)\s*(?:C[OÓ]D\.?\s*)?0*(\d{3,6})\s*[-–]")


def normalizar_codigo(codigo: str | int) -> str:
    return str(codigo).strip().zfill(6)


def extrair_codigo(descricao: str) -> str | None:
    """Código de catálogo no início da descrição, com seis dígitos, ou ``None``."""
    achado = _CODIGO_INICIAL.match(descricao or "")
    return normalizar_codigo(achado.group(1)) if achado else None


def _indices() -> tuple[dict[str, FamiliaControlada], dict[str, FamiliaControlada], dict[str, CodigoLegado]]:
    oficiais: dict[str, FamiliaControlada] = {}
    legados: dict[str, FamiliaControlada] = {}
    detalhe: dict[str, CodigoLegado] = {}
    for familia in FAMILIAS:
        for codigo in familia.renem:
            oficiais[codigo] = familia
        for legado in familia.legados:
            legados[legado.codigo] = familia
            detalhe[legado.codigo] = legado
    return oficiais, legados, detalhe


_POR_CODIGO_OFICIAL, _POR_CODIGO_LEGADO, _DETALHE_LEGADO = _indices()


def _nomes_da_familia(familia: FamiliaControlada) -> set[str]:
    nomes = {familia.nome_oficial, *familia.sinonimos, *(legado.nome for legado in familia.legados)}
    nomes.update(familia.nomes_renem)
    return {normalizar_texto(nome) for nome in nomes}


_POR_NOME_EXATO: dict[str, FamiliaControlada] = {}
for _familia in FAMILIAS:
    for _nome in _nomes_da_familia(_familia):
        _POR_NOME_EXATO[_nome] = _familia


@dataclass(frozen=True)
class ClassificacaoItem:
    familia: str | None
    codigo_item: str | None
    fonte: FonteClassificacao


def classificar_item(descricao: str, *, nomes_renem: dict[str, str] | None = None) -> ClassificacaoItem:
    """Classifica um item do plano de aplicação numa família com controle por unidade.

    Ordem: código oficial (RENEM) -> código legado -> nome exato. Descrição com dois
    equipamentos ("A + B") não é classificada. ``nomes_renem`` (código -> nome oficial)
    deixa o chamador ligar a lista carregada no banco ao casamento por nome.
    """
    texto = (descricao or "").strip()
    if not texto:
        return ClassificacaoItem(None, None, "nao_classificado")
    # Dois equipamentos num só texto: dois códigos separados por "+", ou um "+" entre nomes curtos.
    # Descrição técnica longa pode trazer "+" sem ser lista de equipamentos.
    dois_codigos = len(_CODIGO_EM_QUALQUER_LUGAR.findall(texto)) >= 2
    if dois_codigos or (re.search(r"\s\+\s", texto) and len(texto) <= _LIMITE_TEXTO_COM_MAIS):
        return ClassificacaoItem(None, extrair_codigo(texto), "multiplo")
    codigo = extrair_codigo(texto)
    if codigo is not None:
        if codigo in _POR_CODIGO_OFICIAL:
            return ClassificacaoItem(_POR_CODIGO_OFICIAL[codigo].catalogo_codigo, codigo, "codigo_oficial")
        if codigo in _POR_CODIGO_LEGADO:
            return ClassificacaoItem(_POR_CODIGO_LEGADO[codigo].catalogo_codigo, codigo, "codigo_legado")
        return ClassificacaoItem(None, codigo, "nao_classificado")
    nome = normalizar_texto(nome_do_item(texto))
    familia = _POR_NOME_EXATO.get(nome)
    if familia is None and nomes_renem:
        for cod, nome_renem in nomes_renem.items():
            if normalizar_texto(nome_renem) == nome and cod in _POR_CODIGO_OFICIAL:
                return ClassificacaoItem(_POR_CODIGO_OFICIAL[cod].catalogo_codigo, cod, "nome_exato")
    if familia is not None:
        codigo_unico = familia.renem[0] if len(familia.renem) == 1 else None
        return ClassificacaoItem(familia.catalogo_codigo, codigo_unico, "nome_exato")
    for candidata in FAMILIAS:
        for prefixo in candidata.prefixos:
            if nome == normalizar_texto(prefixo) or nome.startswith(normalizar_texto(prefixo) + " "):
                return ClassificacaoItem(candidata.catalogo_codigo, None, "nome_inicio")
    return ClassificacaoItem(None, None, "nao_classificado")


def familias_controladas() -> tuple[str, ...]:
    return tuple(f.catalogo_codigo for f in FAMILIAS)
