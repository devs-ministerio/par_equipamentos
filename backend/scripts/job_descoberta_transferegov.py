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
venv ativo). Idempotente: recaptura o detalhe oficial de propostas existentes,
inclusive revisadas, sem alterar a decisão humana. A primeira captura completa
é uma baseline silenciosa; rodadas seguintes notificam mudanças por campo.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime

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
from app.repositories.monitoramento import obter_instrumento_por_nr_convenio
from app.repositories.notificacoes import criar_notificacao
from app.services.capturas_fonte import CapturaEmAndamento, captura
from app.services.equipamento_marcadores import DadosMarcador, TipoEvidencia, registrar_marcadores
from app.services.espelho_transferegov import reconciliar_arvore, resumir_mudancas
from app.services.evidencias_transferegov import registrar_evidencias_relacionais
from scripts.job_verificacao_transferegov import reconciliar_situacoes
from scripts.levantamento_convenios_oncologia import (
    PALAVRAS_PROGRAMA_ONCOLOGIA,
    _componente_alvo_de,
    _normalizar,
    _paginar_transferegov,
    _sessao_com_retry,
)

MARCADOR_BASELINE = "_espelho"

# Acima disto, propostas novas na mesma rodada viram um único aviso-resumo
# (carga inicial ou programa novo com dezenas de propostas não inunda a equipe).
LIMITE_AVISOS_INDIVIDUAIS = 10


def avisar_propostas_novas(db, novos: list[tuple[int, str, str]], *, carga_inicial: bool) -> int:
    """Avisos de proposta nova: individuais só em rodada pequena e com baseline.

    ``novos`` traz (PropostaCandidata.id, título, corpo). Retorna quantos
    avisos foram criados.
    """
    if not novos:
        return 0
    if carga_inicial or len(novos) > LIMITE_AVISOS_INDIVIDUAIS:
        primeiro_id = novos[0][0]
        titulo = (
            f"Carga inicial do Radar: {len(novos)} proposta(s) registrada(s)"
            if carga_inicial
            else f"Radar: {len(novos)} proposta(s) nova(s) nesta rodada"
        )
        corpo = "Consulte a lista de novas propostas no Radar de convênios."
        criar_notificacao(
            db,
            Notificacao(tipo=NotificacaoTipo.proposta_candidata, titulo=titulo, corpo=corpo, entidade_id=primeiro_id),
        )
        return 1
    for entidade_id, titulo, corpo in novos:
        criar_notificacao(
            db,
            Notificacao(tipo=NotificacaoTipo.proposta_candidata, titulo=titulo, corpo=corpo, entidade_id=entidade_id),
        )
    return len(novos)


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
            alvo[p["id_programa"]] = {"nome_programa": nome, "componente_alvo": componente, "registro": p}
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
    a cada rodada, inclusive para candidatos já revisados. A decisão humana
    não é alterada pela recaptura dos dados oficiais."""
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


def _registrar_marcadores_da_captura(db, candidata: PropostaCandidata, detalhe: dict) -> None:
    evidencias = classificar_descricoes(extrair_descricoes(detalhe, {"nm_item"}))
    tipo_evidencia: TipoEvidencia = "meta"
    confianca = 100
    if not evidencias:
        evidencias = classificar_descricoes([candidata.ds_objeto], relacao_padrao="mencao")
        tipo_evidencia = "objeto"
        confianca = 40
    registrar_marcadores(
        db=db,
        origem="proposta_candidata",
        origem_id=candidata.id,
        marcadores=[
            DadosMarcador(
                evidencia=evidencia, tipo_evidencia=tipo_evidencia, confianca=confianca, origem_dado="API TransfereGov"
            )
            for evidencia in evidencias
        ],
    )


def run() -> None:
    with captura("transferegov_descoberta") as cap:
        _executar(cap)


def _atualizar_captura_existente(db, existente: PropostaCandidata, detalhe: dict) -> tuple[bool, bool]:
    anterior = existente.metas_resumo or {}
    baseline = isinstance(anterior.get(MARCADOR_BASELINE), dict)
    confirmado, mudancas = reconciliar_arvore(anterior, detalhe)
    confirmado[MARCADOR_BASELINE] = anterior.get(MARCADOR_BASELINE) or {
        "versao": 1,
        "capturado_em": datetime.now(UTC).isoformat(),
    }
    proposta = confirmado["proposta"]
    assert isinstance(proposta, dict)
    for campo, fonte in (
        ("situacao_proposta", "situacao_proposta"),
        ("vl_global_proposta", "vl_total_planejamento_gastos"),
        ("nm_proponente", "nm_ente_recebedor"),
        ("cnpj_ente_recebedor", "cnpj_ente_recebedor"),
        ("municipio", "nm_municipio_recebedor"),
        ("uf", "sg_uf_recebedor"),
        ("ds_objeto", "ds_objeto"),
    ):
        if proposta.get(fonte) is not None:
            setattr(existente, campo, proposta[fonte])
    if proposta.get("dt_proposta"):
        existente.data_proposta = date.fromisoformat(str(proposta["dt_proposta"])[:10])
    programa = confirmado.get("programa")
    if isinstance(programa, dict) and programa.get("nm_programa"):
        existente.nm_programa = programa["nm_programa"]
    parceria = confirmado.get("parceria")
    if isinstance(parceria, dict):
        existente.tem_parceria = True
        if parceria.get("cd_parceria") is not None:
            existente.cd_parceria = str(parceria["cd_parceria"])
    existente.equipamento_detectado = _equipamento_detectado(existente.ds_objeto)
    existente.metas_resumo = confirmado
    registrar_evidencias_relacionais(db, proposta_candidata_id=existente.id, detalhe=confirmado)
    _registrar_marcadores_da_captura(db, existente, confirmado)
    instrumento = obter_instrumento_por_nr_convenio(db, existente.cd_parceria or str(existente.id_proposta))
    if instrumento is None and existente.cd_parceria:
        instrumento = obter_instrumento_por_nr_convenio(db, str(existente.id_proposta))
    if instrumento is not None and instrumento.tipo_contratacao != "Parceria TransfereGov":
        instrumento = None
    if instrumento is not None:
        timeline = confirmado.get("timeline_financeira") or {}
        assert isinstance(timeline, dict)
        ordens = timeline.get("ordens_pagamento") or []
        mais_recente = max(ordens, key=lambda ordem: ordem.get("dt_emissao_op") or "") if ordens else {}
        reconciliar_situacoes(
            instrumento,
            parceria.get("in_situacao_parceria") if isinstance(parceria, dict) else None,
            mais_recente.get("in_situacao_op"),
        )
    if baseline and mudancas:
        criar_notificacao(
            db,
            Notificacao(
                tipo=NotificacaoTipo.atualizacao_api if instrumento is not None else NotificacaoTipo.proposta_candidata,
                titulo=f"Proposta {existente.id_proposta}: {len(mudancas)} mudança(s) no TransfereGov",
                corpo=resumir_mudancas(mudancas),
                entidade_id=instrumento.id if instrumento is not None else existente.id,
            ),
        )
        return True, True
    return bool(mudancas or not baseline), False


def _executar(cap: CapturaEmAndamento) -> None:
    sessao = _sessao_com_retry()
    programas_alvo = _resolver_programas_alvo(sessao)
    print(f"{len(programas_alvo)} programa(s) do TransfereGov batem com um dos 8 componentes-alvo.")
    cap.detalhes["programas_alvo"] = len(programas_alvo)
    if not programas_alvo:
        # A API respondeu sem nenhum programa-alvo: não é prova de que eles
        # deixaram de existir; registra como parcial e não altera nada.
        cap.parcial = "API não devolveu nenhum programa-alvo; nenhuma proposta foi alterada."
        return

    db = SessionLocal()
    novos = 0
    atualizados = 0
    avisos = 0
    verificadas = 0
    novos_para_aviso: list[tuple[int, str, str]] = []
    try:
        carga_inicial = db.query(PropostaCandidata.id).first() is None
        for id_programa, info in programas_alvo.items():
            propostas = _paginar_transferegov("proposta", {"id_programa": id_programa}, sessao)
            for p, id_proposta in _propostas_com_identificador(propostas):
                verificadas += 1
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
                    metas_resumo["programa"] = info["registro"]
                    metas_resumo[MARCADOR_BASELINE] = {"versao": 1, "capturado_em": datetime.now(UTC).isoformat()}
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
                    _registrar_marcadores_da_captura(db, candidato, metas_resumo)
                    novos_para_aviso.append(
                        (
                            candidato.id,
                            f"Proposta nova: {valores_api['nm_proponente'] or id_proposta}",
                            f"{info['componente_alvo']} — {ds_objeto[:140]}",
                        )
                    )
                    novos += 1
                else:
                    parceria = _buscar_parceria(sessao, id_proposta)
                    detalhe = _capturar_detalhe_completo(sessao, id_proposta, p, parceria)
                    detalhe["programa"] = info["registro"]
                    existente.id_programa = id_programa
                    existente.componente_batido = info["componente_alvo"]
                    mudou, avisou = _atualizar_captura_existente(db, existente, detalhe)
                    atualizados += int(mudou)
                    avisos += int(avisou)
        avisos += avisar_propostas_novas(db, novos_para_aviso, carga_inicial=carga_inicial)
        db.commit()
    finally:
        db.close()

    cap.itens_verificados = verificadas
    cap.itens_alterados = novos + atualizados
    cap.avisos_criados = avisos
    cap.detalhes.update(novos=novos, atualizados=atualizados, carga_inicial=carga_inicial)
    print(f"Concluído: {novos} candidato(s) novo(s), {atualizados} atualizado(s).")


if __name__ == "__main__":
    run()
