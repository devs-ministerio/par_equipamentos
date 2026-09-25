"""Reconstrói fases gerais ausentes a partir do histórico ativo e realizado.

É um reparo de leitura + INSERT append-only para todo o monitoramento interno.
Nunca usa ``data_prevista`` como ocorrência, não altera o evento de origem e
não conclui sem um marco de inauguração efetivamente realizado.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import EventoMarco, MarcoCatalogo, MarcoGrupo

# Somente marcos cuja semântica no catálogo comprova a transição. Marcos de
# contratação, TRP/TRD ou ordem de serviço não são promovidos por inferência.
FASE_POR_MARCO = {
    "cronograma_chegada_porto": "fase_equipamento_em_aquisicao",
    "cronograma_chegada_obra": "fase_equipamento_em_aquisicao",
    "cronograma_obra_inicio": "fase_em_andamento",
    "cronograma_obra_fim": "fase_em_andamento",
    "cronograma_instalacao_inicio": "fase_comissionamento",
    "cronograma_instalacao_fim": "fase_comissionamento",
    "cronograma_comissionamento": "fase_comissionamento",
    "cronograma_entrega": "fase_comissionamento",
    "regulatorio_licenca_operacao": "fase_equipamento_entregue",
    "cronograma_previsao_inauguracao": "fase_concluido",
}


def fase_para_evento(codigo_marco: str, codigo_fase_vinculada: str | None) -> str | None:
    """Prefere a fase já escolhida no evento; só infere mapeamentos inequívocos."""
    return codigo_fase_vinculada or FASE_POR_MARCO.get(codigo_marco)


def executar(*, dry_run: bool = False, hoje: date | None = None) -> dict[str, int]:
    """Materializa eventos diretos de fase sem reescrever histórico existente."""
    hoje = hoje or date.today()
    resultado: dict[str, int] = defaultdict(int)
    with SessionLocal() as db:
        marcos = {marco.id: marco for marco in db.execute(select(MarcoCatalogo)).scalars()}
        fases = {marco.codigo: marco for marco in marcos.values() if marco.grupo == MarcoGrupo.fase_geral}
        eventos = (
            db.execute(
                select(EventoMarco).where(
                    EventoMarco.deletado_em.is_(None),
                    EventoMarco.substituido_por_id.is_(None),
                )
            )
            .scalars()
            .all()
        )
        instrumento_ids = {evento.instrumento_id for evento in eventos}
        existentes = {
            (evento.instrumento_id, evento.marco_id, evento.data_ocorrencia)
            for evento in eventos
            if evento.marco_id in marcos and marcos[evento.marco_id].grupo == MarcoGrupo.fase_geral
        }
        candidatos: dict[tuple[int, int], tuple[date, EventoMarco]] = {}
        for evento in eventos:
            marco = marcos.get(evento.marco_id)
            if marco is None or marco.grupo == MarcoGrupo.fase_geral or evento.data_ocorrencia is None:
                continue
            if evento.data_ocorrencia > hoje:
                resultado["ocorrencias_futuras_ignoradas"] += 1
                continue
            fase_vinculada = marcos.get(evento.fase_geral_id) if evento.fase_geral_id else None
            codigo_fase = fase_para_evento(marco.codigo, fase_vinculada.codigo if fase_vinculada else None)
            if codigo_fase is None or codigo_fase not in fases:
                resultado["marcos_sem_mapeamento"] += 1
                continue
            # Conclusão só pode decorrer da inauguração efetiva, nunca de
            # licença, comissionamento ou de uma previsão.
            if codigo_fase == "fase_concluido" and marco.codigo != "cronograma_previsao_inauguracao":
                resultado["conclusoes_sem_inauguracao_ignoradas"] += 1
                continue
            chave = (evento.instrumento_id, fases[codigo_fase].id)
            anterior = candidatos.get(chave)
            if anterior is None or evento.data_ocorrencia > anterior[0]:
                candidatos[chave] = (evento.data_ocorrencia, evento)

        for (instrumento_id, fase_id), (data_ocorrencia, origem) in candidatos.items():
            if (instrumento_id, fase_id, data_ocorrencia) in existentes:
                continue
            fase = marcos[fase_id]
            db.add(
                EventoMarco(
                    instrumento_id=instrumento_id,
                    marco_id=fase.id,
                    data_ocorrencia=data_ocorrencia,
                    observacao=(
                        "Fase geral reconstruída a partir de marco histórico ativo "
                        f"#{origem.id} ({marcos[origem.marco_id].codigo}); reparo append-only."
                    ),
                )
            )
            existentes.add((instrumento_id, fase_id, data_ocorrencia))
            resultado["fases_gerais_criadas"] += 1
        resultado["instrumentos_analisados"] = len(instrumento_ids)
        if dry_run:
            db.rollback()
        else:
            db.commit()
    print(("SIMULACAO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in sorted(resultado.items())))
    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    argumentos = parser.parse_args()
    executar(dry_run=argumentos.dry_run)
