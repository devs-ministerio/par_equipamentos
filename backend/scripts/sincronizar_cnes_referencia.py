"""Sincroniza `cnes_estabelecimento` (espelho local, silver) a partir do
parquet fornecido pelo usuário 2026-09-16:
s3://dept-oncologia-dados/silver/cnes_estabelecimentos.parquet (635 mil
estabelecimentos, camada silver do datasus-lakehouse do usuário).

Por que uma cópia local em vez de consultar o parquet/API direto a cada
request: (1) as APIs públicas do CNES/DataSUS/ElastiCNES não são
alcançáveis do ambiente de desenvolvimento (testado ao vivo 2026-09-16,
timeout/conexão recusada em apidadosabertos.saude.gov.br e
elasticnes.saude.gov.br); (2) o parquet inteiro (65MB) é pesado demais pra
carregar a cada validação de PATCH. Uma tabela local pequena (cnes, nome,
cnpj, município, uf, cep, logradouro) resolve os 2 problemas.

Requer AWS credenciais configuradas (aws cli local ou variáveis de
ambiente padrão AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN)
com leitura no bucket -- em produção/CI isso precisa virar secret novo
(mesma categoria de DATABASE_URL em radar_convenios.yml), ainda não
configurado.

Uso: uv run python -m scripts.sincronizar_cnes_referencia (de dentro de
backend/, venv ativo, `uv add boto3 pyarrow pandas` se ainda não tiver).
Idempotente -- upsert por `cnes`, roda de novo sem duplicar.
"""
from __future__ import annotations

import boto3
import pandas as pd
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.base import SessionLocal
from app.db.models import CnesEstabelecimento

BUCKET = "dept-oncologia-dados"
KEY = "silver/cnes_estabelecimentos.parquet"
LOCAL_PATH = "/tmp/cnes_estabelecimentos.parquet"
LOTE = 5000


def _baixar() -> None:
    s3 = boto3.client("s3")
    s3.download_file(BUCKET, KEY, LOCAL_PATH)


def _valor(v) -> str | None:
    return str(v) if pd.notna(v) else None


def run() -> None:
    print(f"Baixando s3://{BUCKET}/{KEY}...")
    _baixar()
    df = pd.read_parquet(LOCAL_PATH)
    print(f"{len(df)} estabelecimento(s) no parquet -- montando registros...")

    registros = []
    for row in df.itertuples(index=False):
        cnes = str(row.CNES).strip().zfill(7)
        if not cnes or cnes == "0000000":
            continue
        registros.append(dict(
            cnes=cnes,
            nome_estabelecimento=_valor(row.NOME_ESTABELECIMENTO) or "",
            cnpj=_valor(row.CNPJ),
            municipio=_valor(row.MUNICIPIO_ACENTUADO),
            uf=_valor(row.SG_UF),
            cep=_valor(row.CEP),
            logradouro=_valor(row.LOGRADOURO),
        ))

    # Upsert em lote (INSERT ... ON CONFLICT DO UPDATE) -- 635 mil linhas
    # via ORM 1 a 1 (db.get + setattr) era da ordem de horas; em lote de
    # 5000 fica da ordem de segundos.
    db = SessionLocal()
    try:
        tabela = CnesEstabelecimento.__table__
        for i in range(0, len(registros), LOTE):
            lote = registros[i : i + LOTE]
            stmt = pg_insert(tabela).values(lote)
            stmt = stmt.on_conflict_do_update(
                index_elements=["cnes"],
                set_={
                    "nome_estabelecimento": stmt.excluded.nome_estabelecimento,
                    "cnpj": stmt.excluded.cnpj,
                    "municipio": stmt.excluded.municipio,
                    "uf": stmt.excluded.uf,
                    "cep": stmt.excluded.cep,
                    "logradouro": stmt.excluded.logradouro,
                    "sincronizado_em": func.now(),
                },
            )
            db.execute(stmt)
            db.commit()
            print(f"  {min(i + LOTE, len(registros))}/{len(registros)}...")
        print(f"Concluído: {len(registros)} estabelecimento(s) sincronizado(s).")
    finally:
        db.close()


if __name__ == "__main__":
    run()
