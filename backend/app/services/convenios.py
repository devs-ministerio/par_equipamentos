"""Leitura de "Instrumentos firmados": projeção de disponibilidade de dados e junção com CNES/marcadores.

Função solta com `db` keyword-only; sem escrita, então nunca commita.
"""

from __future__ import annotations

from typing import cast

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.models import Convenio
from app.domain_errors import NotFoundError
from app.repositories.cnes_estabelecimento import municipios_por_cnes, nomes_por_cnes
from app.repositories.convenios import listar_convenios_paginados, obter_convenio_por_numero
from app.repositories.equipamento_marcadores import listar_por_origens
from app.schemas_convenios import ConvenioDetalheRead, ConvenioListaRead, ConvenioRead
from app.schemas_equipamentos import serializar_marcadores

TIPOS_SEM_DADOS_OFICIAIS = frozenset({"FAF", "TED", "PERSUS I", "PERSUS II", "PRONON"})


def projecao_disponibilidade_dados(convenio: Convenio) -> dict[str, bool | float | None]:
    """Projeta o que pode ser afirmado para a origem do instrumento.

    Cargas manuais não possuem execução extraída de API. O valor global é
    tratado como integralmente desembolsado por regra explícita da carteira,
    sem fingir que os demais detalhes financeiros existem.
    """
    carga_manual = convenio.tipo_contratacao in TIPOS_SEM_DADOS_OFICIAIS
    return {
        "dados_oficiais_disponiveis": not carga_manual,
        "valor_desembolsado": convenio.valor_global if carga_manual else convenio.valor_desembolsado,
        "desembolso_integral_da_carga": carga_manual,
    }


def _com_nome_cnes(db: Session, convenios: list[Convenio], modelo: type[BaseModel] = ConvenioRead) -> list[BaseModel]:
    codigos = {c.cnes for c in convenios if c.cnes}
    nomes = nomes_por_cnes(db, codigos)
    municipios = municipios_por_cnes(db, codigos)
    marcadores = listar_por_origens(db, convenio_ids={c.id for c in convenios})
    resultado = []
    for convenio in convenios:
        disponibilidade = projecao_disponibilidade_dados(convenio)
        campos = {
            "cnes_nome_estabelecimento": nomes.get(convenio.cnes or ""),
            "cnes_municipio": municipios.get(convenio.cnes or ""),
            "equipamentos": serializar_marcadores(marcadores.get(("convenio", convenio.id), [])),
            **disponibilidade,
        }
        if modelo is ConvenioDetalheRead and not disponibilidade["dados_oficiais_disponiveis"]:
            campos.update(siconv_raw=None, transferegov_raw=None)
        resultado.append(modelo.model_validate(convenio).model_copy(update=campos))
    return resultado


def listar_convenios(
    *,
    db: Session,
    busca: str | None,
    uf: str | None,
    equipamento: str | None,
    situacao: str | None,
    ano: int | None,
    programa: str | None,
    tipo_contratacao: str | None,
    pagina: int,
    tamanho_pagina: int,
) -> ConvenioListaRead:
    total, itens = listar_convenios_paginados(
        db,
        busca=busca,
        uf=uf,
        equipamento=equipamento,
        situacao=situacao,
        ano=ano,
        programa=programa,
        tipo_contratacao=tipo_contratacao,
        pagina=pagina,
        tamanho_pagina=tamanho_pagina,
    )
    return ConvenioListaRead(total=total, itens=cast(list[ConvenioRead], _com_nome_cnes(db, itens)))


def obter_convenio(*, db: Session, numero: str) -> ConvenioDetalheRead:
    convenio = obter_convenio_por_numero(db, numero)
    if convenio is None:
        raise NotFoundError(f"Convênio {numero} não encontrado.")
    return cast(ConvenioDetalheRead, _com_nome_cnes(db, [convenio], ConvenioDetalheRead)[0])
