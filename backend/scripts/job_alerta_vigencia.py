"""Job de alerta -- fim de vigência do convênio a 3 meses (Plan Mode
notificacoes-escopo 2026-09-25, ver
docs/arquitetura/planmode-notificacoes-escopo-2026-09-25.md).

Varre `Convenio.data_final_vigencia` entre hoje e hoje+JANELA_DIAS; a equipe
precisa atuar junto do convenente pra prorrogar a vigência antes que ela
expire. Destinatário resolvido por `criar_notificacao` (titular/suplente do
instrumento monitorado + gestor/admin; sem instrumento monitorado, broadcast
pra todo colaborador/gestor/admin ativo -- decisão do usuário 2026-09-25:
a proximidade do fim de vigência é relevante mesmo sem técnico designado).

Dedup: não reemite pro mesmo convênio se já existe uma notificação desse
tipo nos últimos `DEDUP_DIAS` dias -- evita repetir todo dia durante os ~90
dias de janela, mas reemite mensalmente se ninguém agir.

Uso: python -m scripts.job_alerta_vigencia (de dentro de backend/, venv
ativo). Pensado pra rodar dentro de .github/workflows/radar_convenios.yml,
mesma cadência dos outros 3 jobs de notificação.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio, Notificacao, NotificacaoTipo
from app.repositories.notificacoes import criar_notificacao

JANELA_DIAS = 90
DEDUP_DIAS = 30


def run() -> None:
    db = SessionLocal()
    emitidos = 0
    try:
        hoje = date.today()
        limite = hoje + timedelta(days=JANELA_DIAS)
        convenios = db.execute(
            select(Convenio).where(
                Convenio.data_final_vigencia.is_not(None),
                Convenio.data_final_vigencia >= hoje,
                Convenio.data_final_vigencia <= limite,
            )
        ).scalars().all()
        if not convenios:
            print(f"Nenhum convênio com vigência terminando nos próximos {JANELA_DIAS} dias.")
            return

        corte_dedup = date.today() - timedelta(days=DEDUP_DIAS)
        for convenio in convenios:
            data_final_vigencia = convenio.data_final_vigencia
            assert data_final_vigencia is not None  # garantido pelo where() acima
            ja_emitido = db.execute(
                select(Notificacao.id)
                .where(
                    Notificacao.tipo == NotificacaoTipo.alerta_vigencia,
                    Notificacao.entidade_id == convenio.id,
                    Notificacao.created_at >= corte_dedup,
                )
                .limit(1)
            ).scalar_one_or_none()
            if ja_emitido is not None:
                continue

            dias_restantes = (data_final_vigencia - hoje).days
            criar_notificacao(
                db,
                Notificacao(
                    tipo=NotificacaoTipo.alerta_vigencia,
                    titulo=f"Convênio {convenio.numero} — vigência termina em {dias_restantes} dia(s)",
                    corpo=(
                        f"Vigência termina em {data_final_vigencia:%d/%m/%Y}. "
                        "Avaliar prorrogação junto ao convenente."
                    ),
                    entidade_id=convenio.id,
                ),
            )
            emitidos += 1
        db.commit()
    finally:
        db.close()

    print(f"Concluído: {emitidos} alerta(s) de vigência emitido(s).")


if __name__ == "__main__":
    run()
