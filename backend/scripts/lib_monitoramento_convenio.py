"""Escrita em `convenio` ("Instrumentos firmados") pra origem sem número
oficial (FAF/TED/PERSUS I/PERSUS II/PRONON) -- correção 2026-09-18 do Plan
Mode monitoramento-ingestao. Compartilhado entre
`corrigir_escopo_instrumentos_firmados.py` (correção pontual dos 249
registros já carregados) e `importar_programas_monitoramento.py`/
`importar_planilha_monitoramento.py` (carga daqui pra frente), pra não
triplicar a mesma regra de mapeamento de campo.
"""
from __future__ import annotations

import re
import unicodedata
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Convenio

# O componente/serviço "Radioterapia" não é equipamento e não deve virar
# marcador visual -- por isso esta lista NÃO reaproveita os 14 padrões de
# `frontend/src/lib/equipamento-tags.ts` (que classificam item bruto de
# SICONV/TransfereGov, fonte que FAF/TED/PERSUS/PRONON não têm) nem os de
# `importar_convenios_banco.py::PADROES_EQUIPAMENTO`, só os 4 equipamentos
# que já apareceram de fato em `equipamento_descricao` desta origem (achado
# 2026-09-19: Mamógrafo/Braquiterapia/Ultrassom ficavam SEM nenhum
# marcador em "Instrumentos firmados" -- só Acelerador Linear era
# reconhecido desde o POC original de 2026-09-03).
_PADROES_EQUIPAMENTO: list[tuple[str, re.Pattern]] = [
    ("Acelerador Linear", re.compile(r"ACELERADOR\s*LINEAR")),
    ("Mamógrafo", re.compile(r"MAMOGRAFO")),
    ("Braquiterapia", re.compile(r"BRAQUITERAPIA")),
    ("Ultrassom", re.compile(r"ULTRA\s*SS?OM")),
]


def _norm(s: object) -> str:
    s = unicodedata.normalize("NFD", str(s) if s is not None else "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").upper().strip()


def equipamentos_tags(*textos: str | None) -> list[str]:
    texto = _norm(" | ".join(t for t in textos if t))
    return [tag for tag, padrao in _PADROES_EQUIPAMENTO if padrao.search(texto)]


def espelhar_convenio(
    db: Session,
    *,
    numero: str,
    chave_origem: str,
    tipo_contratacao: str,
    tipologia: str | None,
    origem_dado: str | None,
    nome_convenente: str,
    cnpj_convenente: str | None,
    municipio: str | None,
    uf: str | None,
    cnes: str | None,
    programa: str | None,
    ano_instrumento: int | None,
    objeto: str | None,
    situacao: str | None,
    investimento: float | Decimal | None,
    equipamento_descricao: str | None,
    componente: str | None,
) -> Convenio:
    """Upsert por `chave_origem` (nunca por `numero` -- `numero` é
    aleatório pra estas origens e não pode ser reconstruído a partir da
    fonte na próxima execução)."""
    convenio = db.execute(select(Convenio).where(Convenio.chave_origem == chave_origem)).scalar_one_or_none()
    campos = dict(
        numero=numero,
        tipo_contratacao=tipo_contratacao,
        origem_dado=origem_dado,
        chave_origem=chave_origem,
        convenente_nome=nome_convenente,
        convenente_cnpj=cnpj_convenente,
        municipio=municipio,
        uf=uf,
        cnes=cnes,
        programa=programa,
        ano_instrumento=ano_instrumento,
        objeto=objeto,
        situacao=situacao,
        valor_global=(Decimal(str(investimento)) if investimento is not None else None),
        tipologia=tipologia,
        equipamentos_tags=equipamentos_tags(equipamento_descricao, componente),
        pagamentos_count=0,
        financeiro_fonte_confiavel=False,
    )
    if convenio is None:
        convenio = Convenio(**campos)
        db.add(convenio)
    else:
        for campo, valor in campos.items():
            setattr(convenio, campo, valor)
    return convenio
