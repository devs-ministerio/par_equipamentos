"""Job de descoberta -- Radar de Convenios (fluxo em
docs/arquitetura/fluxo_requisicao.md). Roda DIARIO (TransfereGov novo e API
leve/paginada, sem custo real de rodar todo dia -- diferente do SICONV
legado, ver job_verificacao_siconv.py).

Escopo (2 filtros combinados, pedido do usuario 2026-09-15):
  1. Só os `id_programa` que batem com um dos 8 COMPONENTES_ALVO (resolvido
     A CADA RODADA -- id_programa muda todo ano, novo `programa` e criado,
     ver docstring de levantar_componente() no levantamento).
  2. Dentro desses, casa `ds_objeto` contra PADROES_EQUIPAMENTO (roll
     prioritario) so pra enriquecer `equipamento_detectado` -- NAO filtra
     proposta fora, o criterio de entrada no radar e o componente
     (equipamento e informativo extra pra revisao, nem toda proposta de
     equipamento oncologico tem objeto claro o bastante pra casar texto).

Dedup por `id_proposta` (TransfereGov) -- NUNCA comparado contra
nr_convenio/cnpj do SICONV legado (universos disjuntos, sistemas de eras
diferentes sem campo em comum -- achado 2026-09-15, ver docstring de
PropostaCandidata.id_proposta em app/db/models.py).

Uso: python -m scripts.job_descoberta_transferegov (de dentro de backend/,
venv ativo). Idempotente -- roda de novo sem duplicar proposta ja vista, so
atualiza campo que mudou de verdade (diff campo a campo) num candidato
ainda PENDENTE e notifica -- candidato ja aceito/rejeitado nao e mais
tocado por este job (decisao da equipe fica fechada).
"""
from __future__ import annotations

from app.db.base import SessionLocal
from app.db.models import Notificacao, NotificacaoTipo, PropostaCandidata, PropostaCandidataStatus
from app.pipeline.transferegov_parcerias import buscar_cronograma_por_proposta, buscar_metas_por_proposta
from scripts.levantamento_convenios_oncologia import (
    PADROES_EQUIPAMENTO,
    PALAVRAS_PROGRAMA_ONCOLOGIA,
    _componente_alvo_de,
    _normalizar,
    _paginar_transferegov,
    _sessao_com_retry,
)

# Campos que, se mudarem num candidato ainda pendente, viram notificacao
# camada 1 (atualizacao real vinda da API) -- mesmo criterio documentado em
# docs/arquitetura/fluxo_requisicao.md, secao "Detectando o que realmente
# mudou": so dispara quando o VALOR muda, nunca por presenca/ausencia.
CAMPOS_DIFF = ("situacao_proposta", "vl_global_proposta", "nm_proponente", "cnpj_ente_recebedor")


def _equipamento_detectado(texto: str) -> str | None:
    norm = _normalizar(texto or "")
    for nome, padrao in PADROES_EQUIPAMENTO.items():
        if padrao.search(norm):
            return nome
    return None


def _resolver_programas_alvo(sessao) -> dict[int, dict]:
    """id_programa -> {nome_programa, componente_alvo} -- so os que batem
    com um dos 8 COMPONENTES_ALVO. Resolvido a cada rodada (nao cacheado)
    porque id_programa muda todo ano."""
    programas = _paginar_transferegov("programa", {}, sessao)
    alvo: dict[int, dict] = {}
    for p in programas:
        nome = p.get("nm_programa") or ""
        objetivo = p.get("ds_objetivo") or ""
        if not any(k in _normalizar(f"{nome} {objetivo}") for k in PALAVRAS_PROGRAMA_ONCOLOGIA):
            continue
        componente = _componente_alvo_de(nome)
        if componente:
            alvo[p["id_programa"]] = {"nome_programa": nome, "componente_alvo": componente}
    return alvo


def _buscar_parceria(sessao, id_proposta: int) -> tuple[bool, str | None]:
    """1 request extra por proposta -- volume baixo (escopo e so 8
    programas-alvo, nao o dump nacional), aceitavel pra ter o dado certo em
    vez de adivinhar. Devolve (tem_parceria, cd_parceria) -- cd_parceria
    (ex. 202500044035) e o codigo formal, mais proximo de um "NR_CONVENIO"
    do sistema novo do que `id_proposta` (achado 2026-09-15, testado ao
    vivo contra /parcerias/parceria: campo `cd_parceria` no registro).
    Pega a 1a parceria quando ha mais de 1 (nao deveria acontecer no
    fluxo normal proposta->parceria, mas a API nao garante 0 ou 1)."""
    from app.pipeline.transferegov_parcerias import buscar_parcerias_por_proposta
    parcerias = buscar_parcerias_por_proposta(sessao, id_proposta)
    if not parcerias:
        return False, None
    cd = parcerias[0].get("cd_parceria")
    return True, str(cd) if cd is not None else None


def run() -> None:
    sessao = _sessao_com_retry()
    programas_alvo = _resolver_programas_alvo(sessao)
    print(f"{len(programas_alvo)} programa(s) do TransfereGov batem com um dos 8 componentes-alvo.")

    db = SessionLocal()
    novos = 0
    atualizados = 0
    try:
        for id_programa, info in programas_alvo.items():
            propostas = _paginar_transferegov("proposta", {"id_programa": id_programa}, sessao)
            for p in propostas:
                id_proposta = p.get("id_proposta")
                if id_proposta is None:
                    continue
                ds_objeto = p.get("ds_objeto") or ""
                valores_api = {
                    "situacao_proposta": p.get("situacao_proposta"),
                    "vl_global_proposta": p.get("vl_total_planejamento_gastos"),
                    "nm_proponente": p.get("nm_ente_recebedor") or "",
                    "cnpj_ente_recebedor": p.get("cnpj_ente_recebedor") or "",
                }

                existente = db.query(PropostaCandidata).filter_by(id_proposta=id_proposta).one_or_none()

                if existente is None:
                    tem_parceria, cd_parceria = _buscar_parceria(sessao, id_proposta)
                    # Detalhe completo pra revisao humana (pedido do usuario
                    # 2026-09-15: "a equipe tecnica precisara de mais
                    # informacoes") -- metas (entregas previstas) e
                    # cronograma_desembolso (parcelas financeiras previstas)
                    # capturados junto da proposta, nao so o header dela.
                    # 2 requests extras por proposta NOVA (nao repete em
                    # diff de candidato ja existente) -- mesmo raciocinio de
                    # volume baixo de _buscar_parceria acima.
                    metas_resumo = {
                        "proposta": p,
                        "metas": buscar_metas_por_proposta(sessao, id_proposta),
                        "cronograma_desembolso": buscar_cronograma_por_proposta(sessao, id_proposta),
                    }
                    candidato = PropostaCandidata(
                        id_proposta=id_proposta,
                        cnpj_ente_recebedor=valores_api["cnpj_ente_recebedor"],
                        nm_proponente=valores_api["nm_proponente"],
                        municipio=p.get("nm_municipio_recebedor"),
                        uf=p.get("sg_uf_recebedor"),
                        ds_objeto=ds_objeto,
                        nm_programa=info["nome_programa"],
                        id_programa=id_programa,
                        componente_batido=info["componente_alvo"],
                        equipamento_detectado=_equipamento_detectado(ds_objeto),
                        vl_global_proposta=valores_api["vl_global_proposta"],
                        situacao_proposta=valores_api["situacao_proposta"],
                        data_proposta=p.get("dt_proposta") or None,
                        metas_resumo=metas_resumo,
                        tem_parceria=tem_parceria,
                        cd_parceria=cd_parceria,
                        status=PropostaCandidataStatus.pendente,
                    )
                    db.add(candidato)
                    db.flush()
                    db.add(Notificacao(
                        tipo=NotificacaoTipo.proposta_candidata,
                        titulo=f"Proposta nova: {valores_api['nm_proponente'] or id_proposta}",
                        corpo=f"{info['componente_alvo']} — {ds_objeto[:140]}",
                        entidade_id=candidato.id,
                    ))
                    novos += 1
                elif existente.status == PropostaCandidataStatus.pendente:
                    mudou: dict[str, dict] = {}
                    for campo in CAMPOS_DIFF:
                        antigo = getattr(existente, campo)
                        novo = valores_api[campo]
                        if antigo != novo:
                            mudou[campo] = {"old": antigo, "new": novo}
                            setattr(existente, campo, novo)
                    # cd_parceria so pode SURGIR depois (proposta virou
                    # parceria entre 1 rodada e outra) -- so vale a pena a
                    # request extra quando ainda nao tinha parceria.
                    if not existente.tem_parceria:
                        tem_parceria, cd_parceria = _buscar_parceria(sessao, id_proposta)
                        if tem_parceria != existente.tem_parceria or cd_parceria != existente.cd_parceria:
                            mudou["cd_parceria"] = {"old": existente.cd_parceria, "new": cd_parceria}
                            existente.tem_parceria = tem_parceria
                            existente.cd_parceria = cd_parceria
                    if mudou:
                        db.add(Notificacao(
                            tipo=NotificacaoTipo.atualizacao_api,
                            titulo=f"Proposta {id_proposta} atualizada",
                            corpo=f"Campo(s) alterado(s): {', '.join(mudou.keys())}",
                            entidade_id=existente.id,
                        ))
                        atualizados += 1
        db.commit()
    finally:
        db.close()

    print(f"Concluído: {novos} candidato(s) novo(s), {atualizados} atualizado(s).")


if __name__ == "__main__":
    run()
