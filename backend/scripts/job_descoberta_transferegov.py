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

import re

from app.db.base import SessionLocal
from app.db.models import Notificacao, NotificacaoTipo, PropostaCandidata
from app.equipamentos import classificar_descricoes, extrair_descricoes
from app.pipeline.transferegov_parcerias import (
    buscar_analises_por_proposta,
    buscar_contas_por_parceria,
    buscar_cronograma_por_proposta,
    buscar_distribuicao_recurso_por_proposta,
    buscar_documentos_habeis_por_parceria,
    buscar_empenhos_por_parceria,
    buscar_itens_por_etapa,
    buscar_metas_por_proposta,
    buscar_ordens_pagamento_por_documento,
    buscar_parcerias_por_proposta,
)
from app.services.equipamento_marcadores import DadosMarcador, TipoEvidencia, registrar_marcadores
from app.services.evidencias_transferegov import registrar_evidencias_relacionais
from scripts.levantamento_convenios_oncologia import (
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
    evidencias = classificar_descricoes([texto], relacao_padrao="mencao")
    return evidencias[0].nome if evidencias else None


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


def _buscar_parceria(sessao, id_proposta: int) -> dict | None:
    """1 request extra por proposta -- volume baixo (escopo e so 8
    programas-alvo, nao o dump nacional), aceitavel pra ter o dado certo em
    vez de adivinhar. Devolve o registro cru da 1a parceria (ou None) --
    `cd_parceria` (ex. 202500044035) e o codigo formal, mais proximo de um
    "NR_CONVENIO" do sistema novo do que `id_proposta` (achado 2026-09-15,
    testado ao vivo contra /parcerias/parceria). Pega a 1a parceria quando
    ha mais de 1 (nao deveria acontecer no fluxo normal proposta->parceria,
    mas a API nao garante 0 ou 1)."""
    parcerias = buscar_parcerias_por_proposta(sessao, id_proposta)
    return parcerias[0] if parcerias else None


def _capturar_timeline_financeira(sessao, id_parceria: int) -> dict:
    """So chamado quando ja existe parceria -- rastreia a execucao
    financeira ponta a ponta (achado 2026-09-15, pedido do usuario depois
    de revisar a proposta 43829 manualmente: "vamos trazer tudo parecer
    tecnico, origem e timeline financeira"). Documento habil -> ordem de
    pagamento e encadeado (1 request de OP por DH), resto e 1 request cada
    por id_parceria."""
    documentos = buscar_documentos_habeis_por_parceria(sessao, id_parceria)
    ordens = []
    for doc in documentos:
        ordens.extend(buscar_ordens_pagamento_por_documento(sessao, doc["id_documento_habil"]))
    return {
        "contas": buscar_contas_por_parceria(sessao, id_parceria),
        "empenhos": buscar_empenhos_por_parceria(sessao, id_parceria),
        "documentos_habeis": documentos,
        "ordens_pagamento": ordens,
    }


def _capturar_detalhe_completo(sessao, id_proposta: int, p: dict, parceria: dict | None) -> dict:
    """Detalhe completo pra revisao humana (pedido do usuario 2026-09-15:
    "a equipe tecnica precisara de mais informacoes" + depois "vamos trazer
    tudo parecer tecnico, origem e timeline financeira") -- tudo capturado
    UMA VEZ, no momento em que o candidato e criado (nao reconsultado nos
    diffs de candidato ja existente, pra nao multiplicar request por
    rodada). Guardado cru (Any) em metas_resumo, mostrado como veio."""
    metas = buscar_metas_por_proposta(sessao, id_proposta)
    for meta in metas:
        for etapa in meta.get("etapas_proposta", []):
            # Item por item do que sera comprado de verdade -- achado
            # 2026-09-15: sem isso a equipe nao sabia dizer "qual foi o
            # equipamento financiado" (proposta so tinha o objeto generico
            # "AQUISICAO DE EQUIPAMENTO E MATERIAL PERMANENTE").
            etapa["itens"] = buscar_itens_por_etapa(sessao, etapa["id_etapa_proposta"])

    detalhe = {
        "proposta": p,
        "metas": metas,
        "cronograma_desembolso": buscar_cronograma_por_proposta(sessao, id_proposta),
        "analise": buscar_analises_por_proposta(sessao, id_proposta),
        "distribuicao_recurso": buscar_distribuicao_recurso_por_proposta(sessao, id_proposta),
    }
    if parceria is not None:
        detalhe["parceria"] = parceria
        detalhe["timeline_financeira"] = _capturar_timeline_financeira(sessao, parceria["id_parceria"])
    return detalhe


_RE_CNES_NA_ETAPA = re.compile(r"CNES\s*(\d{6,7})")


def _extrair_cnes(metas: list[dict]) -> str | None:
    """CNES embutido no texto de `nm_etapa` (ex. "AQUISIÇÃO DE EQUIPAMENTO
    E MATERIAL PERMANENTE - CNES 0019445") -- achado 2026-09-16, pedido do
    usuário: "vincular um CNES a todos os instrumentos e propostas".
    Validado ao vivo contra a base pública do CNES (município bate em
    9/9 códigos testados na primeira leva) -- confiável porque vem direto
    do texto que a PRÓPRIA proposta carrega, não de um cruzamento por CNPJ
    com outra proposta qualquer (esse outro caminho, testado nos 403
    convênios legado, mostrou-se não confiável -- CNPJ de Fundo/Secretaria
    cobre múltiplas propostas de estabelecimentos diferentes).

    Quando a proposta financia MAIS de 1 estabelecimento (etapas com CNES
    diferentes -- caso real testado na proposta 23810, 3 CNES), fica o CNES
    da etapa que tem o item de MAIOR valor total -- mesmo critério de
    `equipamentoPrincipal()` no front (o "equipamento principal" exibido no
    card e o "CNES principal" gravado aqui sempre apontam pro mesmo
    estabelecimento). Nunca uma lista -- pedido do usuário: "preciso um
    cnes único"."""
    melhor_cnes: str | None = None
    melhor_valor = -1.0
    for meta in metas:
        for etapa in meta.get("etapas_proposta", []):
            m = _RE_CNES_NA_ETAPA.search(etapa.get("nm_etapa") or "")
            if not m:
                continue
            cnes = m.group(1).zfill(7)
            valor_etapa = sum((it.get("vl_total_item") or 0) for it in etapa.get("itens", []))
            if valor_etapa > melhor_valor:
                melhor_valor = valor_etapa
                melhor_cnes = cnes
    return melhor_cnes


def _propostas_com_identificador(propostas: list[dict]) -> list[tuple[dict, int]]:
    """Descarta payloads inválidos na borda antes da persistência."""
    resultado = []
    for proposta in propostas:
        identificador = proposta.get("id_proposta")
        if isinstance(identificador, int):
            resultado.append((proposta, identificador))
    return resultado


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
            for p, id_proposta in _propostas_com_identificador(propostas):
                ds_objeto = p.get("ds_objeto") or ""
                valores_api = {
                    "situacao_proposta": p.get("situacao_proposta"),
                    "vl_global_proposta": p.get("vl_total_planejamento_gastos"),
                    "nm_proponente": p.get("nm_ente_recebedor") or "",
                    "cnpj_ente_recebedor": p.get("cnpj_ente_recebedor") or "",
                }

                existente = db.query(PropostaCandidata).filter_by(id_proposta=id_proposta).one_or_none()

                if existente is None:
                    parceria = _buscar_parceria(sessao, id_proposta)
                    cd_parceria = (
                        str(parceria["cd_parceria"]) if parceria and parceria.get("cd_parceria") is not None else None
                    )
                    metas_resumo = _capturar_detalhe_completo(sessao, id_proposta, p, parceria)
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
                        cnes=_extrair_cnes(metas_resumo.get("metas", [])),
                        tem_parceria=parceria is not None,
                        cd_parceria=cd_parceria,
                    )
                    db.add(candidato)
                    db.flush()
                    registrar_evidencias_relacionais(
                        db,
                        proposta_candidata_id=candidato.id,
                        detalhe=metas_resumo,
                    )
                    evidencias = classificar_descricoes(extrair_descricoes(metas_resumo, {"nm_item"}))
                    tipo_evidencia: TipoEvidencia = "meta"
                    confianca = 100
                    if not evidencias:
                        evidencias = classificar_descricoes([ds_objeto], relacao_padrao="mencao")
                        tipo_evidencia = "objeto"
                        confianca = 40
                    registrar_marcadores(
                        db=db,
                        origem="proposta_candidata",
                        origem_id=candidato.id,
                        marcadores=[
                            DadosMarcador(
                                evidencia=evidencia,
                                tipo_evidencia=tipo_evidencia,
                                confianca=confianca,
                                origem_dado="API TransfereGov",
                            )
                            for evidencia in evidencias
                        ],
                    )
                    db.add(
                        Notificacao(
                            tipo=NotificacaoTipo.proposta_candidata,
                            titulo=f"Proposta nova: {valores_api['nm_proponente'] or id_proposta}",
                            corpo=f"{info['componente_alvo']} — {ds_objeto[:140]}",
                            entidade_id=candidato.id,
                        )
                    )
                    novos += 1
                else:
                    mudou: dict[str, dict] = {}
                    for campo in CAMPOS_DIFF:
                        antigo = getattr(existente, campo)
                        novo = valores_api[campo]
                        if antigo != novo:
                            mudou[campo] = {"old": antigo, "new": novo}
                            setattr(existente, campo, novo)
                    # cd_parceria so pode SURGIR depois (proposta virou
                    # parceria entre 1 rodada e outra) -- so vale a pena a
                    # request extra quando ainda nao tinha parceria. Quando
                    # surge, tambem captura a timeline financeira (nao
                    # existia antes, agora existe).
                    if not existente.tem_parceria:
                        parceria = _buscar_parceria(sessao, id_proposta)
                        cd_parceria = (
                            str(parceria["cd_parceria"])
                            if parceria and parceria.get("cd_parceria") is not None
                            else None
                        )
                        if parceria is not None:
                            mudou["cd_parceria"] = {"old": existente.cd_parceria, "new": cd_parceria}
                            existente.tem_parceria = True
                            existente.cd_parceria = cd_parceria
                            existente.metas_resumo = {
                                **(existente.metas_resumo or {}),
                                "parceria": parceria,
                                "timeline_financeira": _capturar_timeline_financeira(sessao, parceria["id_parceria"]),
                            }
                            registrar_evidencias_relacionais(
                                db,
                                proposta_candidata_id=existente.id,
                                detalhe=existente.metas_resumo,
                            )
                    if mudou:
                        # tipo=proposta_candidata (não atualizacao_api) -- entidade_id aqui é
                        # PropostaCandidata.id, e o contrato documentado em
                        # db/models.py::Notificacao resolve atualizacao_api/edicao_manual
                        # sempre contra InstrumentoEquipamento.id (ver
                        # services/notificacoes.py::listar_notificacoes). Usar
                        # atualizacao_api aqui fazia o destino resolver contra a tabela
                        # errada (instrumento coincidente por id numérico, ou None).
                        db.add(
                            Notificacao(
                                tipo=NotificacaoTipo.proposta_candidata,
                                titulo=f"Proposta {id_proposta} atualizada",
                                corpo=f"Campo(s) alterado(s): {', '.join(mudou.keys())}",
                                entidade_id=existente.id,
                            )
                        )
                        atualizados += 1
        db.commit()
    finally:
        db.close()

    print(f"Concluído: {novos} candidato(s) novo(s), {atualizados} atualizado(s).")


if __name__ == "__main__":
    run()
