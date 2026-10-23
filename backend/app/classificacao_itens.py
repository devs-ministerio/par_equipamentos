"""Classificação de um item do plano de aplicação em camadas explicáveis.

Medida contra a revisão manual do usuário (`data/revisoes/revisao_codigos_RENEM_v2.xlsx`; fixture
`tests/fixtures/gabarito_classificacao_itens.json`). Cada camada devolve o que decidiu e **por quê**;
o que a regra não decide com segurança sai como ``verificar`` e **nunca é aplicado sozinho**.

Camadas: (1) tipo de lançamento por texto, com o valor de solicitação oficial de rendimento como
confirmação; (2) código ou nome da família (`equipamentos_renem`); (3) especificação por família
(canais do tomógrafo, potência da ressonância, IGRT do acelerador, variante do ultrassom, vídeo
endoscópio). Valor corrigido por IPCA ou dólar é só confirmação e fica fora deste módulo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import combinations
from typing import Literal

from app.equipamentos import normalizar_texto
from app.equipamentos_renem import classificar_item, extrair_codigo

TipoLancamento = Literal["aquisicao", "rendimento_aplicacao", "acessorio_insumo", "multiplo", "nao_equipamento"]
Confianca = Literal["alta", "media", "baixa"]

_RENDIMENTO = re.compile(
    r"RENDIMENTOS? (?:DE|DA|DAS|DOS)? ?APLICACAO|UTILIZACAO DE R[EE]*NDIMENTO|COMPLEMENTACAO|COMPLEMENTAR (?:O |OS )?(?:VALOR|ITEM|RECURSO)|"
    r"COMPLEMENTAR A AQUISICAO|VARIACAO CAMBIAL|CONTRAPARTIDA FINANCEIRA|QUITACAO|RECURSO COMPLEMENTAR|"
    r"VALOR DE APLICACAO|IBCC COMPROU"
)
_ADQUIRIDO_COM_RENDIMENTO = re.compile(r"ADQUIRID[OA]S? COM (?:PARTE DE )?RENDIMENTO")
_JANELA_DO_TIPO = 400  # termo de rendimento no meio de uma especificação técnica longa não conta
_ACESSORIO = re.compile(
    r"ARMAZENAMENTO DE (?:REJEITOS|FONTES)|ANTEPARO|CALIBRADOR DE DOSE|NEGATOSCOPIO|LAVADORA DE ENDOSCOPIO|"
    r"^WORKSTATION DE PLANEJAMENTO|APARELHO PARA RADIO ?CIRURGIA|MICRO-?MLC|"
    r"\bPARA RESSONANCIA\b|\bPARA MAMOGRAFO\b"
)
_MULTI = re.compile(r"\bCR\b.*\bDRY\b|DIGITALIZA\w+ DE IMAGEM COMPOSTO|DIGITALIZADOR.*IMPRESSORA")


@dataclass(frozen=True)
class ResultadoItem:
    tipo: TipoLancamento
    familia: str | None
    codigo_item: str | None
    conta_unidade: bool | None  # None = verificar
    confianca: Confianca
    motivo: str


def _soma_bate(alvo: float, valores: list[float], tol: float = 0.5) -> bool:
    for n in (1, 2, 3):
        for grupo in combinations(valores, n):
            if abs(sum(grupo) - alvo) <= tol:
                return True
    return False


def _tipo_lancamento(
    texto_norm: str, valor_total: float | None, solicitacoes: list[float]
) -> tuple[TipoLancamento, str]:
    if _MULTI.search(texto_norm):
        return "multiplo", "texto descreve mais de um equipamento"
    inicio = texto_norm[:_JANELA_DO_TIPO]
    if _RENDIMENTO.search(inicio) and re.search(r"COMPLEMENTAR O VALOR DOS BENS \(", inicio):
        return "multiplo", "rendimento rateado entre vários bens listados"
    if _RENDIMENTO.search(inicio) and not _ADQUIRIDO_COM_RENDIMENTO.search(inicio):
        return "rendimento_aplicacao", "o texto fala em rendimento, complemento, quitação ou variação cambial"
    if _ACESSORIO.search(texto_norm):
        return "acessorio_insumo", "acessório ou insumo do serviço, não o equipamento"
    return "aquisicao", "sem indício de rendimento, acessório ou multi"


def _canais(texto_norm: str) -> int | None:
    m = re.search(r"\b(\d{1,3})\s*(?:CANAIS|CORTES)\b", texto_norm)
    return int(m.group(1)) if m else None


# (nome do equipamento, padrão); vale a menção que aparece primeiro no texto (o título do item).
_CUES: tuple[tuple[str, str], ...] = (
    ("pet", r"TOMOGRAFO POR EMISSAO DE POSITRONS|PET[\s/-]*CT|\bPET\b|EMISSAO DE POSITRONS"),
    ("gama", r"CAMARA DE CINTILACAO|GAMA ?CAMARA|CAMARA CINTILOGRAFICA|CINTILOGRAF"),
    ("acelerador", r"ACELERADOR|LINAC"),
    ("braquiterapia", r"BRAQUITERAPIA"),
    ("simulador", r"SIMULADOR (?:DE TRATAMENTO|PARA RADIOTERAPIA|/ ?TOMOGRAFO)"),
    ("tomografo", r"TOMOGRAF"),
    ("ressonancia", r"RESSONANCIA"),
    ("ultrassom", r"ULTRA\s*SS?OM"),
    ("video", r"VIDEO ?ENDOSCOP"),
    ("arco", r"ARCO CIRURGICO"),
    ("colposcopio", r"COLPOSCOP"),
    ("mamografo", r"MAMOGRAF"),
)


def _primeira_mencao(texto_norm: str) -> str | None:
    achados = []
    for prioridade, (nome, padrao) in enumerate(_CUES):
        m = re.search(padrao, texto_norm)
        if m:
            achados.append((m.start(), prioridade, nome))
    return min(achados)[2] if achados else None


def _especificar(texto_norm: str) -> tuple[str | None, str | None, bool | None, Confianca, str] | None:
    """(familia, codigo, conta_unidade, confianca, motivo) por especificação; None = sem regra."""
    alvo = _primeira_mencao(texto_norm)
    if alvo is None:
        return None
    if alvo == "pet":
        return "pet_ct", "000301", True, "alta", "tomógrafo por emissão de pósitrons"
    if alvo == "gama":
        return "gama_camera_spect", "000595", True, "alta", "câmara de cintilação gama"
    if alvo == "acelerador":
        igrt = re.search(r"\bIGRT\b|CBCT|CONE BEAM|\bKV\b", texto_norm)
        return (
            "acelerador_linear",
            ("011807" if igrt else "011806"),
            True,
            "alta",
            ("IGRT kV ou CBCT no texto" if igrt else "sem IGRT kV nem CBCT: 011806"),
        )
    if alvo == "braquiterapia":
        return "braquiterapia", "010547", True, "alta", "braquiterapia"
    if alvo == "simulador":
        return "simulador_tomografo_radioterapia", "000719", True, "alta", "simulador de radioterapia"
    if alvo == "tomografo":
        n = _canais(texto_norm)
        if n is None:
            return None, None, None, "baixa", "tomógrafo sem número de canais ou cortes: verificar"
        if n <= 16:
            return "tomografo_ate_16_canais", "011804", True, "alta", f"{n} canais ou cortes: até 16"
        return None, "011805", False, "alta", f"{n} canais ou cortes: acima de 16, fora da família"
    if alvo == "ressonancia":
        m = re.search(r"\b(0[,.]5|1[,.]5|3(?:[,.]0)?)\s*(?:T\b|TESLA)", texto_norm)
        if m:
            cod = {"0": "010891", "1": "010889", "3": "010890"}[m.group(1)[0]]
            return "ressonancia", cod, True, "alta", f"potência {m.group(1)} T"
        return "ressonancia", None, None, "baixa", "ressonância sem potência: verificar"
    if alvo == "ultrassom":
        if re.search(r"OFTALMOLOG", texto_norm):
            return None, "000194", False, "alta", "ultrassom oftalmológico: fora da família"
        if re.search(r"TRANSESOFAG", texto_norm) and not re.search(r"SEM APLICACAO TRANSESOFAG", texto_norm):
            return None, "011423", False, "alta", "ultrassom transesofágico: fora da família"
        return "ultrassom_sem_transesofagica", "011422", True, "alta", "ultrassom diagnóstico: 011422"
    if alvo == "video":
        if re.search(r"RIGID", texto_norm):
            return "video_endoscopia_rigida", "010254", True, "alta", "vídeo endoscopia rígida"
        flex = bool(re.search(r"FLEXIVEL", texto_norm))
        return (
            "video_endoscopia_flexivel",
            "011268",
            True,
            ("alta" if flex else "media"),
            ("vídeo endoscópio flexível" if flex else "vídeo endoscópio sem 'rígida': flexível com CCD"),
        )
    if alvo == "arco":
        return "arco_cirurgico", "000253", True, "alta", "arco cirúrgico"
    if alvo == "colposcopio":
        return "colposcopio", "000378", True, "alta", "colposcópio"
    if alvo == "mamografo":
        return "mamografo", "010925", True, "alta", "mamógrafo"
    return None


def classificar(
    descricao: str, *, valor_total: float | None = None, solicitacoes_rendimento: list[float] | None = None
) -> ResultadoItem:
    texto_norm = normalizar_texto(descricao)
    tipo, motivo_tipo = _tipo_lancamento(texto_norm, valor_total, solicitacoes_rendimento or [])
    if tipo != "aquisicao":
        base = classificar_item(descricao)
        familia = base.familia
        codigo = base.codigo_item or extrair_codigo(descricao)
        if familia is None and tipo == "rendimento_aplicacao":
            espec = _especificar(texto_norm)
            if espec is not None and espec[0] is not None:
                familia, codigo = espec[0], espec[1]
        return ResultadoItem(tipo, familia, codigo, False, "alta", motivo_tipo)
    base = classificar_item(descricao)
    espec = _especificar(texto_norm)
    if espec is not None:
        familia, codigo, conta, confianca, motivo = espec
    elif base.familia:
        familia, codigo, conta, confianca, motivo = (
            base.familia,
            base.codigo_item,
            True,
            "alta",
            f"classificação {base.fonte}",
        )
    else:
        return ResultadoItem("aquisicao", None, base.codigo_item, None, "baixa", "sem família reconhecida: verificar")
    if valor_total and solicitacoes_rendimento and _soma_bate(valor_total, solicitacoes_rendimento):
        return ResultadoItem(
            "aquisicao", familia, codigo, None, "baixa", f"{motivo}; valor igual a solicitação de rendimento: verificar"
        )
    return ResultadoItem("aquisicao", familia, codigo, conta, confianca, motivo)
