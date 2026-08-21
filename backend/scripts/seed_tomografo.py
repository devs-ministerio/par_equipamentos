"""Popula o banco com dado de teste pra TOMOGRAFO (Fase Unificacao) --
so pra dar aos endpoints de leitura (GET /macro-coverage,
GET /equipment-offer-rows) algo real pra devolver antes do Modulo 5
(migracao do pipeline ElastiCNES/SIDRA) existir de verdade.

Uso: python -m scripts.seed_tomografo (de dentro de backend/, com venv ativo)

Mesma logica deterministica (hash + variancia 0.55-1.30) que o mock do
frontend usa (frontend/src/data/mockData.ts) -- os numeros aqui devem bater
visualmente com o que o front mostrava antes de trocar pro dado real.
"""
from __future__ import annotations

import math

from app.db.base import SessionLocal
from app.db.models import (
    Competency,
    DeficitStatus,
    EquipmentOfferRow,
    Execution,
    ExecutionMode,
    ExecutionStatus,
    MacroCoverage,
)

MACRORREGIOES = [
    ("ac-1", "Macrorregião Vale do Acre", "AC", 620_000),
    ("al-1", "Macrorregião Leste Alagoano", "AL", 2_100_000),
    ("ap-1", "Macrorregião Central do Amapá", "AP", 780_000),
    ("am-1", "Macrorregião Manaus", "AM", 2_600_000),
    ("ba-1", "Macrorregião Leste (Salvador)", "BA", 4_900_000),
    ("ba-2", "Macrorregião Sudoeste (Vitória da Conquista)", "BA", 1_900_000),
    ("ce-1", "Macrorregião Fortaleza", "CE", 4_300_000),
    ("df-1", "Macrorregião Distrito Federal", "DF", 3_100_000),
    ("es-1", "Macrorregião Grande Vitória", "ES", 2_300_000),
    ("go-1", "Macrorregião Central (Goiânia)", "GO", 3_400_000),
    ("ma-1", "Macrorregião Ilha (São Luís)", "MA", 2_000_000),
    ("mt-1", "Macrorregião Baixada Cuiabana", "MT", 1_600_000),
    ("ms-1", "Macrorregião Campo Grande", "MS", 1_300_000),
    ("mg-1", "Macrorregião Centro (Belo Horizonte)", "MG", 6_100_000),
    ("mg-2", "Macrorregião Triângulo do Sul (Uberaba)", "MG", 1_400_000),
    ("pa-1", "Macrorregião Metropolitana (Belém)", "PA", 3_000_000),
    ("pb-1", "Macrorregião I (João Pessoa)", "PB", 1_900_000),
    ("pr-1", "Macrorregião Leste (Curitiba)", "PR", 3_900_000),
    ("pe-1", "Macrorregião I (Recife)", "PE", 4_000_000),
    ("pi-1", "Macrorregião Centro-Norte (Teresina)", "PI", 1_600_000),
    ("rj-1", "Macrorregião Metropolitana I", "RJ", 6_800_000),
    ("rn-1", "Macrorregião 3 (Natal)", "RN", 1_700_000),
    ("rs-1", "Macrorregião Metropolitana (Porto Alegre)", "RS", 4_400_000),
    ("rs-2", "Macrorregião Sul (Pelotas)", "RS", 1_300_000),
    ("ro-1", "Macrorregião Madeira-Mamoré", "RO", 980_000),
    ("rr-1", "Macrorregião Boa Vista", "RR", 520_000),
    ("sc-1", "Macrorregião Grande Florianópolis", "SC", 2_400_000),
    ("sp-1", "Macrorregião Metropolitana da Capital", "SP", 12_300_000),
    ("sp-2", "Macrorregião Campinas", "SP", 4_200_000),
    ("se-1", "Macrorregião Grande Aracaju", "SE", 1_200_000),
    ("to-1", "Macrorregião Central (Palmas)", "TO", 900_000),
]

ESTABELECIMENTOS = [
    ("3312901", "Instituto Nacional do Câncer (INCA II)", "3304557", "Rio de Janeiro", "RJ", "64_CANAIS", 2, 2, True),
    ("4412903", "Hospital das Clínicas USP", "3550308", "São Paulo", "SP", "128_CANAIS", 3, 3, True),
    ("5523014", "HUB — Hospital Universitário de Brasília", "5300108", "Brasília", "DF", "32_CANAIS", 1, 1, True),
    ("6634125", "Hospital São Rafael", "2927408", "Salvador", "BA", "16_CANAIS", 2, 1, True),
    ("7745236", "Hospital Regional do Baixo Amazonas", "1508001", "Santarém", "PA", "4_CANAIS", 1, 1, True),
]

FAMILIA = "TOMOGRAFO"


def _hash(s: str) -> int:
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    if h >= 0x80000000:
        h -= 0x100000000
    return abs(h)


def _seeded01(seed: str) -> float:
    x = math.sin(_hash(seed)) * 10000
    return x - math.floor(x)


def seed() -> None:
    db = SessionLocal()
    try:
        competency = Competency(label="2026-08")
        db.add(competency)
        db.flush()

        execution = Execution(
            competency_id=competency.id,
            version=1,
            mode=ExecutionMode.manual,
            status=ExecutionStatus.published,
            config_chave_macrorregiao="ibge_municipio",
            config_denominador_oferta="qt_existente_sus",
            active_sources={},
        )
        db.add(execution)
        db.flush()

        for macro_id, nome, uf, pop in MACRORREGIOES:
            demanda = max(1, round(pop / 100_000))
            variancia = 0.55 + _seeded01(f"{macro_id}tomografo") * 0.75
            oferta = max(0, round(demanda * variancia))
            balance = oferta - demanda
            db.add(
                MacroCoverage(
                    execution_id=execution.id,
                    macro_code=macro_id,
                    macro_name=nome,
                    state=uf,
                    equipment_family=FAMILIA,
                    population=pop,
                    estimated_need=demanda,
                    required_qty=demanda,
                    available_qty=oferta,
                    existing_qty=oferta,
                    facility_count=None,
                    balance=balance,
                    deficit_status=DeficitStatus.not_deficient if balance >= 0 else DeficitStatus.deficient,
                )
            )

        for cnes, nome, ibge, municipio, uf, subtipo, qtd, uso, sus in ESTABELECIMENTOS:
            db.add(
                EquipmentOfferRow(
                    execution_id=execution.id,
                    cnes_code=cnes,
                    facility_name=nome,
                    ibge_code=ibge,
                    municipality_name=municipio,
                    state=uf,
                    equipment_family=FAMILIA,
                    equipment_subtype=subtipo,
                    existing_qty=qtd,
                    in_use_qty=uso,
                    sus_flag=sus,
                )
            )

        db.commit()
        print(f"Seed ok -- competency={competency.id} execution={execution.id}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
