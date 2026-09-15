"""Reversão pontual -- Radar de Convênios. Pedido do usuário 2026-09-15:
"Pode remover os 10 do monitoramento interno" (as 10
InstrumentoEquipamento tipo_contratacao="Parceria TransfereGov" criadas
ao aceitar propostas em Linhas de financiamento nesta mesma sessão),
depois de constatar que aceitar só cria um registro esqueleto (sem
técnico titular/nível de monitoramento) -- ver "Configuração pendente"
em monitoramento-overview-page.tsx.

Confirmado com o usuário (pergunta direta) que a PropostaCandidata
correspondente volta pra status="pendente" (revisado_por/revisado_em
limpos), pra reaparecer em "Novas propostas" e poder ser aceita de novo
depois, quando o fluxo de configuração de monitoramento estiver pronto.

SÓ BANCO LOCAL -- nunca produção (ver CLAUDE.md, "Alteração importante").
Não lê DATABASE_URL do .env de propósito (.env deste repo aponta pra
Neon/produção) -- conecta direto no Postgres local por engine própria,
mesma URL usada no resto da sessão pra testar contra o banco local.

Uso: python -m scripts.remover_instrumentos_parceria_transferegov
(de dentro de backend/, venv ativo). Idempotente -- rodar de novo com os
10 já removidos não altera nada (fica silencioso, 0 encontrados)."""
from __future__ import annotations

import getpass

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.models import InstrumentoEquipamento, PropostaCandidata, PropostaCandidataStatus

LOCAL_DATABASE_URL = f"postgresql+psycopg://{getpass.getuser()}@localhost:5432/SIEO-Sistema-de-Informacao-de-Equipamentos-Oncologicos"

# Os 10 nr_convenio criados ao aceitar as propostas nesta sessão (=
# cd_parceria de cada PropostaCandidata aceita) -- lista fechada, não uma
# query ampla por tipo_contratacao, pra nunca arriscar apagar um
# "Parceria TransfereGov" que a equipe tenha cadastrado por fora depois.
NR_CONVENIOS_A_REMOVER = [
    "202500044035", "202500023344", "202500040313", "202500040941",
    "202500042951", "202500037881", "202500041420", "202500037234",
    "202500023008", "202500042048",
]


def run() -> None:
    engine = create_engine(LOCAL_DATABASE_URL)
    db = Session(engine)
    removidos = 0
    propostas_resetadas = 0
    try:
        for nr_convenio in NR_CONVENIOS_A_REMOVER:
            inst = (
                db.query(InstrumentoEquipamento)
                .filter(InstrumentoEquipamento.nr_convenio == nr_convenio)
                .one_or_none()
            )
            if inst is None:
                continue
            # EventoMarco/AcaoMonitoramento têm ondelete="CASCADE" na FK
            # (ver app/db/models.py) -- delete direto do instrumento já
            # limpa os filhos no banco, sem precisar apagar 1 a 1 aqui.
            db.delete(inst)
            removidos += 1

            proposta = (
                db.query(PropostaCandidata)
                .filter(PropostaCandidata.cd_parceria == nr_convenio)
                .one_or_none()
            )
            if proposta is not None:
                proposta.status = PropostaCandidataStatus.pendente
                proposta.revisado_por = None
                proposta.revisado_em = None
                propostas_resetadas += 1

        db.commit()
    finally:
        db.close()

    print(f"Concluído: {removidos} instrumento(s) removido(s), {propostas_resetadas} proposta(s) voltaram pra status=pendente.")


if __name__ == "__main__":
    run()
