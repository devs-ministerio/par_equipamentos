"""Caso de uso idempotente para persistir evidências de equipamento."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import EquipamentoCatalogo, EquipamentoMarcador
from app.equipamentos import EvidenciaEquipamento
from app.repositories.equipamento_marcadores import OrigemMarcador, catalogo_por_codigo, obter_existente

TipoEvidencia = Literal["item_orcamentario", "meta", "objeto", "planilha", "programa", "legado"]


@dataclass(frozen=True)
class DadosMarcador:
    evidencia: EvidenciaEquipamento
    tipo_evidencia: TipoEvidencia
    confianca: int
    origem_dado: str | None


def chave_da_evidencia(
    *,
    origem: OrigemMarcador,
    origem_id: int,
    codigo: str,
    descricao: str,
    tipo_evidencia: TipoEvidencia,
) -> str:
    conteudo = "|".join((origem, str(origem_id), codigo, descricao.strip(), tipo_evidencia))
    return hashlib.sha256(conteudo.encode("utf-8")).hexdigest()


def registrar_marcadores(
    *,
    db: Session,
    origem: OrigemMarcador,
    origem_id: int,
    marcadores: list[DadosMarcador],
    catalogo: dict | None = None,
    chaves_existentes: set[tuple[OrigemMarcador, int, int, str]] | None = None,
) -> int:
    """Inclui somente evidências novas; não apaga revisão humana existente."""
    catalogo = catalogo or catalogo_por_codigo(db)
    criados = 0
    for dado in marcadores:
        equipamento = catalogo.get(dado.evidencia.codigo)
        if equipamento is None:
            # Itens do plano sem família curada continuam sendo equipamentos
            # reais e precisam aparecer quando não houver prioritário. O
            # código vem do texto normalizado + hash, portanto é estável em
            # reexecuções e não depende do número do Convênio.
            equipamento = db.execute(
                select(EquipamentoCatalogo).where(EquipamentoCatalogo.codigo == dado.evidencia.codigo)
            ).scalar_one_or_none()
            if equipamento is None:
                equipamento = EquipamentoCatalogo(
                    codigo=dado.evidencia.codigo,
                    nome=dado.evidencia.nome,
                    prioritario=False,
                )
                db.add(equipamento)
                db.flush()
            catalogo[dado.evidencia.codigo] = equipamento
        chave = chave_da_evidencia(
            origem=origem,
            origem_id=origem_id,
            codigo=dado.evidencia.codigo,
            descricao=dado.evidencia.descricao_original,
            tipo_evidencia=dado.tipo_evidencia,
        )
        chave_composta = (origem, origem_id, equipamento.id, chave)
        if chaves_existentes is not None and chave_composta in chaves_existentes:
            continue
        if chaves_existentes is None:
            existente = obter_existente(
                db,
                origem=origem,
                origem_id=origem_id,
                equipamento_catalogo_id=equipamento.id,
                chave_evidencia=chave,
            )
            if existente is not None:
                continue
        else:
            chaves_existentes.add(chave_composta)
        destino: dict[str, int | None] = {
            "convenio_id": None,
            "proposta_candidata_id": None,
            "instrumento_equipamento_id": None,
        }
        destino[f"{origem}_id"] = origem_id
        db.add(
            EquipamentoMarcador(
                equipamento_catalogo_id=equipamento.id,
                descricao_original=dado.evidencia.descricao_original,
                tipo_evidencia=dado.tipo_evidencia,
                relacao=dado.evidencia.relacao,
                confianca=dado.confianca,
                chave_evidencia=chave,
                origem_dado=dado.origem_dado,
                **destino,
            )
        )
        criados += 1
    return criados
