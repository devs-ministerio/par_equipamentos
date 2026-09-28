"""Cria fontes canônicas e vincula apenas origens legadas determinísticas."""

from __future__ import annotations

import argparse
import json

from sqlalchemy import select

from app.audit import log_action
from app.db.base import SessionLocal
from app.db.models import Convenio, FonteDado, InstrumentoEquipamento, PagamentoObraPersus

FONTES = {
    "siconv_transferegov": ("API SICONV/TransfereGov", "api"),
    "transferegov": ("API TransfereGov", "api"),
    "persus_i": ("PERSUS I", "planilha"),
    "persus_ii": ("PERSUS II", "arquivo"),
    "controle_persus": ("Controle PERSUS", "planilha"),
    "planilha_monitoramento": ("Planilha de monitoramento interno", "planilha"),
}


def _codigo(origem: str | None) -> str | None:
    texto = (origem or "").upper()
    if "SICONV/TRANSFEREGOV" in texto:
        return "siconv_transferegov"
    if "CONTROLE PERSUS" in texto:
        return "controle_persus"
    if "PERSUS II" in texto:
        return "persus_ii"
    if "PERSUS I" in texto or "PER-SUS" in texto:
        return "persus_i"
    if "TRANSFEREGOV" in texto:
        return "transferegov"
    if "MONITORAMENTO" in texto:
        return "planilha_monitoramento"
    return None


def executar(*, aplicar: bool, backup_reference: str | None) -> dict[str, int | bool]:
    if aplicar and not backup_reference:
        raise ValueError("--apply exige --backup-reference com backup confirmado.")
    with SessionLocal() as db:
        fontes = {f.codigo: f for f in db.execute(select(FonteDado)).scalars()}
        criadas = 0
        for codigo, (nome, tipo) in FONTES.items():
            if codigo not in fontes:
                fontes[codigo] = FonteDado(codigo=codigo, nome=nome, tipo=tipo)
                db.add(fontes[codigo])
                criadas += 1
        if aplicar:
            db.flush()
        vinculados = 0
        for modelo in (Convenio, InstrumentoEquipamento, PagamentoObraPersus):
            for item in db.execute(select(modelo)).scalars():
                codigo = _codigo(item.origem_dado)
                if codigo and item.fonte_dado_id != fontes[codigo].id:
                    vinculados += 1
                    if aplicar:
                        item.fonte_dado_id = fontes[codigo].id
        resultado: dict[str, int | bool] = {
            "fontes_criadas": criadas,
            "vinculos_atualizados": vinculados,
            "modo_dry_run": not aplicar,
        }
        if aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="fonte_dado",
                entity_id=None,
                action="backfill_proveniencia_estruturada",
                details={**resultado, "backup_reference": backup_reference},
            )
            db.commit()
        return resultado


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-reference")
    args = parser.parse_args()
    print(json.dumps(executar(aplicar=args.apply, backup_reference=args.backup_reference), ensure_ascii=False))


if __name__ == "__main__":
    main()
