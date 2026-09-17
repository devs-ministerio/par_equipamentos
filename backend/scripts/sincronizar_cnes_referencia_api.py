"""Sincroniza `cnes_estabelecimento` a partir do ElastiCNES (índice
`cnes-equipamentos*`), em vez do parquet S3 (`sincronizar_cnes_referencia.py`)
-- achado 2026-09-16, pedido do usuário: "o cnes deve ser atualizado pela
API" em vez de só a carga inicial do S3. Complementa (não substitui): só
cobre CNES que já apareceram no índice de equipamentos alguma vez -- um
estabelecimento sem histórico de equipamento de imagem não está aqui, então
esse script serve pra popular/atualizar os CNES referenciados por
convenio/instrumento_equipamento/proposta_candidata, não pra carga completa
dos ~635 mil estabelecimentos (isso continua sendo o parquet).

Uso: uv run python -m scripts.sincronizar_cnes_referencia_api (de dentro de
backend/, venv ativo). Sem argumento, sincroniza os CNES já referenciados em
convenio/instrumento_equipamento/proposta_candidata que ainda não estão (ou
estão desatualizados) em cnes_estabelecimento. Idempotente -- upsert por
`cnes`, roda de novo sem duplicar.
"""
from __future__ import annotations

from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.base import SessionLocal
from app.db.models import CnesEstabelecimento
from app.pipeline.api_elasticnes import BASE_URL, INDICE, _bsearch, _parse_location, _sessao_com_retry


def _cnes_referenciados(db) -> set[str]:
    """Une os CNES em uso nas 3 tabelas que têm FK física pra
    cnes_estabelecimento -- só os que batem no formato de 7 dígitos (os
    demais não vão resolver em FK nenhuma, ver
    docs/arquitetura/planmode-database-2026-09-16.md)."""
    codigos: set[str] = set()
    for tabela in ("instrumento_equipamento", "convenio", "proposta_candidata"):
        existe = db.execute(
            text("select to_regclass(:t) is not null"), {"t": tabela}
        ).scalar()
        if not existe:
            continue
        linhas = db.execute(
            text(f"select distinct cnes from {tabela} where cnes ~ '^[0-9]{{7}}$'")
        ).fetchall()
        codigos.update(r[0] for r in linhas)
    return codigos


def _buscar_estabelecimento(session, cnes: str) -> dict | None:
    """Busca o hit mais recente (maior COMPETÊNCIA) pra 1 CNES no índice de
    equipamentos. None se o CNES nunca apareceu nesse índice (estabelecimento
    sem histórico de equipamento de imagem)."""
    corpo = {
        "size": 1,
        "query": {"bool": {"filter": [{"term": {"CNES.keyword": cnes}}]}},
        "sort": [{"COMPETÊNCIA": "desc"}],
    }
    resposta = _bsearch(session, {"params": {"index": INDICE, "body": corpo}})
    hits = resposta["hits"]["hits"]
    if not hits:
        return None
    f = hits[0]["_source"]
    latitude, longitude = _parse_location(f.get("location"))

    def _limpo(v: str | None) -> str | None:
        return None if v in (None, "N/A", "") else v

    return dict(
        cnes=cnes,
        nome_estabelecimento=_limpo(f.get("NOME FANTASIA")) or _limpo(f.get("RAZÃO SOCIAL")) or "",
        cnpj=_limpo(f.get("CNPJ DO ESTABELECIMENTO")),
        municipio=_limpo(f.get("MUNICÍPIO")),
        uf=_limpo(f.get("UF")),
        cep=_limpo(f.get("CEP")),
        logradouro=_limpo(f.get("LOGRADOURO")),
        latitude=latitude,
        longitude=longitude,
        fonte_sincronizacao="elasticnes",
    )


def run(cnes_codes: set[str] | None = None) -> None:
    db = SessionLocal()
    try:
        codigos = cnes_codes if cnes_codes is not None else _cnes_referenciados(db)
        print(f"{len(codigos)} CNES a sincronizar via ElastiCNES...")

        session = _sessao_com_retry()
        encontrados = []
        nao_encontrados = []
        for cnes in sorted(codigos):
            registro = _buscar_estabelecimento(session, cnes)
            if registro is None:
                nao_encontrados.append(cnes)
                continue
            encontrados.append(registro)
            print(f"  {cnes}: {registro['nome_estabelecimento']}")

        if encontrados:
            tabela = CnesEstabelecimento.__table__
            stmt = pg_insert(tabela).values(encontrados)
            stmt = stmt.on_conflict_do_update(
                index_elements=["cnes"],
                set_={
                    "nome_estabelecimento": stmt.excluded.nome_estabelecimento,
                    "cnpj": stmt.excluded.cnpj,
                    "municipio": stmt.excluded.municipio,
                    "uf": stmt.excluded.uf,
                    "cep": stmt.excluded.cep,
                    "logradouro": stmt.excluded.logradouro,
                    "latitude": stmt.excluded.latitude,
                    "longitude": stmt.excluded.longitude,
                    "fonte_sincronizacao": stmt.excluded.fonte_sincronizacao,
                    "sincronizado_em": func.now(),
                },
            )
            db.execute(stmt)
            db.commit()

        print(f"Concluído: {len(encontrados)} sincronizado(s), {len(nao_encontrados)} não encontrado(s) no índice.")
        if nao_encontrados:
            print("Não encontrados (sem histórico de equipamento no ElastiCNES):", nao_encontrados)
    finally:
        db.close()


if __name__ == "__main__":
    run()
