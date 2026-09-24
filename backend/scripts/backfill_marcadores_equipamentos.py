"""Backfill idempotente dos marcadores centralizados de equipamentos.

Roda em simulação por padrão. ``--aplicar`` só deve ser usado após a
migration, snapshot e revisão do relatório de divergências.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable
from typing import Any, cast

from sqlalchemy import delete, select
from sqlalchemy.engine import CursorResult

from app.db.base import SessionLocal
from app.db.models import Convenio, EquipamentoMarcador, InstrumentoEquipamento, PropostaCandidata
from app.equipamentos import EvidenciaEquipamento, classificar_descricoes, extrair_descricoes
from app.repositories.equipamento_marcadores import OrigemMarcador, catalogo_por_codigo
from app.services.equipamento_marcadores import DadosMarcador, TipoEvidencia, registrar_marcadores
from scripts.lib_monitoramento_convenio import adicionar_item_manual_inicial


def _valores_por_chave(payload: object, chaves: set[str]) -> Iterable[str]:
    if isinstance(payload, dict):
        for chave, valor in payload.items():
            if chave in chaves and isinstance(valor, str):
                yield valor
            yield from _valores_por_chave(valor, chaves)
    elif isinstance(payload, list):
        for valor in payload:
            yield from _valores_por_chave(valor, chaves)


def _dados(
    evidencias: list[EvidenciaEquipamento],
    *,
    tipo: TipoEvidencia,
    confianca: int,
    origem_dado: str | None,
) -> list[DadosMarcador]:
    return [
        DadosMarcador(
            evidencia=e,
            tipo_evidencia=tipo,
            confianca=confianca,
            origem_dado=origem_dado,
        )
        for e in evidencias
    ]


def _integrar_itens_manuais(db, instrumentos_por_numero: dict[str, InstrumentoEquipamento]) -> int:
    integrados = 0
    for convenio in db.execute(select(Convenio)).scalars():
        instrumento = instrumentos_por_numero.get(convenio.numero)
        descricao_manual = instrumento.equipamento_descricao if instrumento is not None else None
        if descricao_manual is None and convenio.tipo_contratacao == "PERSUS I":
            descricao_manual = "Acelerador Linear"
        if not descricao_manual:
            continue
        antes = list((convenio.siconv_raw or {}).get("itens_plano_aplicacao") or [])
        adicionar_item_manual_inicial(
            convenio,
            descricao_manual,
            instrumento.origem_dado if instrumento is not None else convenio.origem_dado,
        )
        depois = list((convenio.siconv_raw or {}).get("itens_plano_aplicacao") or [])
        integrados += int(len(depois) > len(antes))
    return integrados


def _chaves_existentes(db, aplicar: bool) -> set[tuple[OrigemMarcador, int, int, str]]:
    chaves: set[tuple[OrigemMarcador, int, int, str]] = set()
    marcadores = [] if aplicar else db.execute(select(EquipamentoMarcador)).scalars()
    for marcador in marcadores:
        origem: OrigemMarcador
        origem_id: int | None
        if marcador.convenio_id is not None:
            origem, origem_id = "convenio", marcador.convenio_id
        elif marcador.proposta_candidata_id is not None:
            origem, origem_id = "proposta_candidata", marcador.proposta_candidata_id
        else:
            origem, origem_id = "instrumento_equipamento", marcador.instrumento_equipamento_id
        assert origem_id is not None
        chaves.add((origem, origem_id, marcador.equipamento_catalogo_id, marcador.chave_evidencia))
    return chaves


def executar(*, aplicar: bool) -> dict[str, int]:
    resultado = {
        "convenios": 0,
        "propostas": 0,
        "instrumentos": 0,
        "marcadores_criados": 0,
        "marcadores_ja_existentes": 0,
        "itens_manuais_integrados": 0,
        "marcadores_removidos": 0,
    }
    with SessionLocal() as db:
        # Os marcadores desta primeira centralização foram todos produzidos
        # por carga automática. Reconstruí-los evita manter a contaminação
        # anterior, causada por propostas TransfereGov agregadas por CNPJ.
        if aplicar:
            exclusao = cast(CursorResult[Any], db.execute(delete(EquipamentoMarcador)))
            resultado["marcadores_removidos"] = exclusao.rowcount or 0

        instrumentos_por_numero = {
            instrumento.nr_convenio: instrumento for instrumento in db.execute(select(InstrumentoEquipamento)).scalars()
        }
        resultado["itens_manuais_integrados"] = _integrar_itens_manuais(db, instrumentos_por_numero)

        catalogo = catalogo_por_codigo(db)
        chaves_existentes = _chaves_existentes(db, aplicar)
        resultado["marcadores_ja_existentes"] = len(chaves_existentes)

        for convenio in db.execute(select(Convenio)).scalars():
            descricoes_itens = extrair_descricoes(convenio.siconv_raw, {"DESCRICAO_ITEM", "descricao_item"})
            evidencias = classificar_descricoes(descricoes_itens)
            dados = _dados(evidencias, tipo="item_orcamentario", confianca=100, origem_dado=convenio.origem_dado)
            resultado["marcadores_criados"] += registrar_marcadores(
                db=db,
                origem="convenio",
                origem_id=convenio.id,
                marcadores=dados,
                catalogo=catalogo,
                chaves_existentes=chaves_existentes,
            )
            resultado["convenios"] += 1

        for proposta in db.execute(select(PropostaCandidata)).scalars():
            descricoes = list(_valores_por_chave(proposta.metas_resumo, {"nm_item"}))
            evidencias = classificar_descricoes(descricoes)
            if not evidencias:
                evidencias = classificar_descricoes([proposta.ds_objeto], relacao_padrao="mencao")
                dados = _dados(evidencias, tipo="objeto", confianca=40, origem_dado="objeto da proposta")
            else:
                dados = _dados(evidencias, tipo="meta", confianca=100, origem_dado="metas da proposta")
            resultado["marcadores_criados"] += registrar_marcadores(
                db=db,
                origem="proposta_candidata",
                origem_id=proposta.id,
                marcadores=dados,
                catalogo=catalogo,
                chaves_existentes=chaves_existentes,
            )
            resultado["propostas"] += 1

        for instrumento in db.execute(select(InstrumentoEquipamento)).scalars():
            evidencias = classificar_descricoes([instrumento.equipamento_descricao or ""])
            resultado["marcadores_criados"] += registrar_marcadores(
                db=db,
                origem="instrumento_equipamento",
                origem_id=instrumento.id,
                marcadores=_dados(evidencias, tipo="planilha", confianca=90, origem_dado=instrumento.origem_dado),
                catalogo=catalogo,
                chaves_existentes=chaves_existentes,
            )
            resultado["instrumentos"] += 1

        if aplicar:
            db.commit()
        else:
            db.rollback()
    resumo = ", ".join(f"{chave}={valor}" for chave, valor in resultado.items())
    print(("APLICADO" if aplicar else "SIMULAÇÃO") + ": " + resumo)
    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--aplicar", action="store_true", help="Persiste após snapshot e aprovação da simulação.")
    executar(aplicar=parser.parse_args().aplicar)
