"""Ajuste de identificador pós-correção (2026-09-18, mesmo dia da correção
de escopo em `corrigir_escopo_instrumentos_firmados.py`) -- 2 achados do
usuário ao revisar o resultado:

  1. PERSUS I/PERSUS II/PRONON: o prefixo do id aleatório repetia o nome
     do tipo já mostrado como badge ao lado (ex. "PERSUS I PERSUS1-135842").
     Prefixo encurtado: PERSUS1- -> PS1-, PERSUS2- -> PS2-, PRONON- -> PN-.
  2. FAF/TED: têm identidade oficial (NUP SEI), diferente de PERSUS/PRONON
     que não têm nenhum identificador oficial -- decisão do usuário: usar
     o NUP SEI (dígitos) direto como `nr_convenio`/`numero`, sem a
     indireção de id aleatório + `chave_origem` separada. `nr_convenio`
     volta a ser exatamente o valor que já estava em `chave_origem`.

Idempotente -- reexecutar não muda nada se já aplicado. `--dry-run` faz
rollback no final e imprime o que seria feito.
"""

from __future__ import annotations

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio, InstrumentoEquipamento

PREFIXOS_ANTIGOS_PARA_NOVOS = {
    "PERSUS1-": "PS1-",
    "PERSUS2-": "PS2-",
    "PRONON-": "PN-",
}


def _renomear_prefixo(valor: str) -> str:
    for antigo, novo in PREFIXOS_ANTIGOS_PARA_NOVOS.items():
        if valor.startswith(antigo):
            return novo + valor[len(antigo) :]
    return valor


def executar(*, dry_run: bool) -> dict[str, int]:
    resultado = {"convenio_prefixo_renomeado": 0, "convenio_faf_ted_revertido": 0, "instrumento_renomeado": 0}
    with SessionLocal() as db:
        for convenio in db.execute(select(Convenio)).scalars():
            eh_faf_ted = convenio.tipo_contratacao in ("FAF", "TED")
            if eh_faf_ted and convenio.chave_origem and convenio.numero != convenio.chave_origem:
                convenio.numero = convenio.chave_origem
                resultado["convenio_faf_ted_revertido"] += 1
            else:
                novo = _renomear_prefixo(convenio.numero)
                if novo != convenio.numero:
                    convenio.numero = novo
                    resultado["convenio_prefixo_renomeado"] += 1

        for instrumento in db.execute(select(InstrumentoEquipamento)).scalars():
            eh_faf_ted = instrumento.tipo_contratacao in ("FAF", "TED")
            diverge = instrumento.nr_convenio != instrumento.chave_origem
            if eh_faf_ted and instrumento.chave_origem and diverge:
                instrumento.nr_convenio = instrumento.chave_origem
                resultado["instrumento_renomeado"] += 1
            else:
                novo = _renomear_prefixo(instrumento.nr_convenio)
                if novo != instrumento.nr_convenio:
                    instrumento.nr_convenio = novo
                    resultado["instrumento_renomeado"] += 1

        if dry_run:
            db.rollback()
        else:
            db.commit()
    print(("SIMULAÇÃO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in resultado.items()))
    return resultado


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    executar(dry_run=args.dry_run)
