"""Job de verificação -- Radar de Convênios (fluxo em
docs/arquitetura/fluxo_requisicao.md). Espelha job_verificacao_siconv.py,
mas pro TransfereGov NOVO -- pedido do usuário 2026-09-15: "dá pra gente
fazer o mesmo monitoramento de situação dos itens do transfere novo?".

Diferente do SICONV legado (dump bulk, precisa do HEAD-check em 2 estágios):
o TransfereGov Novo tem endpoint de consulta AO VIVO por id_proposta/
id_parceria (ver app/pipeline/transferegov_parcerias.py), então este job
roda direto, sem estágio de "mudou ou não" prévio -- 1 request por
instrumento (`/parceria`) + 1 por parceria com documento hábil emitido
(`/documento-habil` -> `/ordem-pagamento`), mesmo padrão de custo baixo já
usado no job de descoberta.

Achado 2026-09-15, testado ao vivo numa amostra nacional de 200 parcerias
(não só as nossas): NÃO existe conceito de "prestação de contas" nesta
API -- `in_situacao_parceria` só tem 'Em Elaboração'/'Em Análise'/
'Em Captação'/'Aprovada'/'Em Execução'/'Rejeitada'/'Inativa', sem estado
"Concluída"/"Encerrada". Por isso 2 campos separados (ver docstring de
InstrumentoEquipamento.situacao_parceria_transferegov em app/db/models.py):
a situação da parceria em si, e a situação da ordem de pagamento mais
recente (sinal real de "dinheiro executado") -- podem divergir, e
divergem na prática (proposta já paga que continua "Aprovada" na
parceria).

Escopo: só tipo_contratacao="Parceria TransfereGov" (nr_convenio =
cd_parceria ou str(id_proposta), ver PropostaCandidata). O
id_proposta/id_parceria não têm coluna própria em InstrumentoEquipamento
(decisão deliberada, sem FK física) -- resolvidos aqui por convenção,
igual o resto do fluxo: casa contra proposta_candidata.cd_parceria ou
proposta_candidata.id_proposta (como string) igual a nr_convenio.

Uso: python -m scripts.job_verificacao_transferegov (de dentro de
backend/, venv ativo).
"""

from __future__ import annotations

from sqlalchemy import or_

from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento, Notificacao, NotificacaoTipo, PropostaCandidata
from app.pipeline.transferegov_parcerias import (
    buscar_documentos_habeis_por_parceria,
    buscar_ordens_pagamento_por_documento,
    buscar_parcerias_por_proposta,
)
from scripts.levantamento_convenios_oncologia import _sessao_com_retry


def _resolver_id_proposta(db, nr_convenio: str) -> int | None:
    """Sem FK física entre instrumento_equipamento e proposta_candidata de
    propósito (formatos de identificador diferentes) -- resolve por
    convenção, mesmo critério documentado na docstring de
    PropostaCandidata.cd_parceria: nr_convenio é ou o cd_parceria ou o
    str(id_proposta) da proposta incluída no monitoramento."""
    criterios = [PropostaCandidata.cd_parceria == nr_convenio]
    id_proposta = _int_ou_none(nr_convenio)
    if id_proposta is not None:
        criterios.append(PropostaCandidata.id_proposta == id_proposta)
    candidata = db.query(PropostaCandidata).filter(or_(*criterios)).one_or_none()
    return candidata.id_proposta if candidata else None


def _int_ou_none(v: str) -> int | None:
    try:
        return int(v)
    except ValueError:
        return None


def _situacao_atual(sessao, id_proposta: int) -> tuple[str | None, str | None]:
    """(situacao_parceria, situacao_ultima_ordem_pagamento) -- None,None
    quando a proposta ainda não tem parceria (não deveria acontecer pra um
    instrumento já criado via aceite, mas a API não garante)."""
    parcerias = buscar_parcerias_por_proposta(sessao, id_proposta)
    if not parcerias:
        return None, None
    parceria = parcerias[0]
    situacao_parceria = parceria.get("in_situacao_parceria")

    situacao_op: str | None = None
    documentos = buscar_documentos_habeis_por_parceria(sessao, parceria["id_parceria"])
    ordens = []
    for doc in documentos:
        ordens.extend(buscar_ordens_pagamento_por_documento(sessao, doc["id_documento_habil"]))
    if ordens:
        # Mais recente por data de emissao -- geralmente so 1, mas a API
        # nao garante.
        mais_recente = max(ordens, key=lambda o: o.get("dt_emissao_op") or "")
        situacao_op = mais_recente.get("in_situacao_op")

    return situacao_parceria, situacao_op


def run() -> None:
    sessao = _sessao_com_retry()
    db = SessionLocal()
    atualizados = 0
    sem_id_proposta = 0
    try:
        instrumentos = (
            db.query(InstrumentoEquipamento)
            .filter(InstrumentoEquipamento.tipo_contratacao == "Parceria TransfereGov")
            .all()
        )
        if not instrumentos:
            print(
                "Nenhum InstrumentoEquipamento com tipo_contratacao='Parceria TransfereGov' cadastrado -- nada pra verificar."
            )
        for inst in instrumentos:
            id_proposta = _resolver_id_proposta(db, inst.nr_convenio)
            if id_proposta is None:
                sem_id_proposta += 1
                continue

            situacao_parceria, situacao_op = _situacao_atual(sessao, id_proposta)
            mudou: dict[str, dict] = {}
            if situacao_parceria != inst.situacao_parceria_transferegov:
                mudou["situacao_parceria_transferegov"] = {
                    "old": inst.situacao_parceria_transferegov,
                    "new": situacao_parceria,
                }
                inst.situacao_parceria_transferegov = situacao_parceria
            if situacao_op != inst.situacao_ordem_pagamento_transferegov:
                mudou["situacao_ordem_pagamento_transferegov"] = {
                    "old": inst.situacao_ordem_pagamento_transferegov,
                    "new": situacao_op,
                }
                inst.situacao_ordem_pagamento_transferegov = situacao_op

            if mudou:
                db.add(
                    Notificacao(
                        tipo=NotificacaoTipo.atualizacao_api,
                        titulo=f"Convênio {inst.nr_convenio} mudou de situação no TransfereGov",
                        corpo=", ".join(f"{c}: {v['old'] or '(vazio)'} → {v['new']}" for c, v in mudou.items()),
                        entidade_id=inst.id,
                    )
                )
                atualizados += 1
        db.commit()
    finally:
        db.close()

    print(
        f"Concluído: {atualizados} instrumento(s) com situação atualizada"
        + (f", {sem_id_proposta} sem proposta candidata correspondente (ignorado)." if sem_id_proposta else ".")
    )


if __name__ == "__main__":
    run()
