"""Job dos avisos de prazo (ação aberta e previsão de inauguração): D-1, D0 e D+1.

Simulação por padrão; `--aplicar --confirmo-host HOST` grava. O agendamento (08:00 de São Paulo) NÃO está
ligado: só se habilita depois da operação de alertas e de uma rodada manual supervisionada. Idempotente:
rodar de novo no mesmo dia não duplica. `--hoje AAAA-MM-DD` serve para ensaio e recuperação de rodada perdida.

Uso:
    python -m scripts.job_prazos_monitoramento
    python -m scripts.job_prazos_monitoramento --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from datetime import date

from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.services.prazos_monitoramento import executar, hoje_em_sao_paulo


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    analisador.add_argument("--hoje", type=date.fromisoformat, default=None, help="data de referência (AAAA-MM-DD)")
    args = analisador.parse_args(argv)

    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    hoje = args.hoje or hoje_em_sao_paulo()
    with SessionLocal() as db:
        r = executar(db, hoje=hoje, aplicar=args.aplicar)
        if r.bloqueado:
            db.rollback()
            print("Outra execução está em andamento; nada foi feito.")
            return 3
        if args.aplicar:
            log_action(
                db,
                user_id=None,
                entity_name="notificacao",
                entity_id=0,
                action="job_prazos_monitoramento",
                details={"hoje": hoje.isoformat(), "avisos": dict(r.avisos), "arquivados": r.arquivados},
            )
            db.commit()
        else:
            db.rollback()
    print(("Avisos gravados" if args.aplicar else "Simulação (nada foi alterado)") + f" — referência {hoje:%d/%m/%Y}")
    print(
        f"  avisos por janela: {dict(r.avisos)}; já emitidos: {r.ja_emitidos}; arquivados por prazo alterado: {r.arquivados}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
