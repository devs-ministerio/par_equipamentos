"""Enriquece os candidatos do Radar com os dados oficiais (recaptura), sem aprovar.

Roda na CI depois da descoberta. Para cada candidato aberto, com o Portal
confirmado e sem recaptura da descoberta atual, grava valor, município, UF e
itens do plano de aplicação. A aprovação continua humana e conferida pelo hash.
"""

from pathlib import Path
from tempfile import TemporaryDirectory

from app.db.base import SessionLocal
from app.db.models_legado import CandidatoLegadoRecaptura, CandidatoLegadoRegistro
from app.domain_errors import ConflictError
from scripts.coletar_recaptura_legado import coletar_recaptura
from scripts.job_recaptura_legado_local import recapturar_candidato


def _pendentes() -> list[int]:
    """Candidatos cuja descoberta atual ainda não tem recaptura."""
    from sqlalchemy import exists, select

    with SessionLocal() as db:
        recapturado = exists().where(
            CandidatoLegadoRecaptura.candidato_id == CandidatoLegadoRegistro.id,
            CandidatoLegadoRecaptura.captura_id == CandidatoLegadoRegistro.ultima_captura_id,
        )
        consulta = (
            select(CandidatoLegadoRegistro.id)
            .where(CandidatoLegadoRegistro.ultima_captura_id.is_not(None), ~recapturado)
            .order_by(CandidatoLegadoRegistro.id)
        )
        return list(db.execute(consulta).scalars())


def run() -> None:
    pendentes = _pendentes()
    gravados = ignorados = falhas = 0
    # Os arquivos nacionais do SICONV são baixados uma vez e reaproveitados.
    with TemporaryDirectory(prefix="sigeo-recaptura-lote-") as diretorio:
        cache = Path(diretorio)
        for candidato_id in pendentes:
            try:
                with SessionLocal() as db:
                    recapturar_candidato(
                        db=db,
                        candidato_id=candidato_id,
                        fabrica_sessao=SessionLocal,
                        coletar=lambda alvo: coletar_recaptura(alvo, cache=cache),
                    )
                gravados += 1
            except ConflictError as erro:
                # Sem confirmação do Portal, encerrado ou fora do escopo: não é falha da fonte.
                ignorados += 1
                print(f"candidato {candidato_id}: ignorado ({erro})")
            except Exception:
                falhas += 1
                print(f"candidato {candidato_id}: falha na coleta; ver rodada siconv_recaptura")
    print(f"recaptura: {gravados} gravada(s), {ignorados} ignorada(s), {falhas} falha(s) de {len(pendentes)}")
    if falhas:
        raise RuntimeError("Recaptura incompleta; conferir as rodadas com erro.")
