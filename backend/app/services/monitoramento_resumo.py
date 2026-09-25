"""Cálculo do resumo agregado de monitoramento (GET /monitoramento/resumo).

Extraído do router (Plan Mode fechamento final 2026-09-25, Bloco 2) -- a
leitura de dados já vinha do Repository desde o Bloco 3 do Plan Mode
consolidação 2026-09-17 (`carregar_dados_resumo_monitoramento`), mas o
cálculo de fase atual, distribuição e divergência de conclusão ainda vivia
inline no endpoint. Router fica só com `Depends`/`response_model`."""

from __future__ import annotations

from collections import Counter
from datetime import date

from sqlalchemy.orm import Session

from app.db.models import MarcoCatalogo, MarcoGrupo
from app.repositories import monitoramento as monitoramento_repo
from app.schemas_monitoramento import (
    ContagemRotulo,
    DivergenciaConclusaoRead,
    InauguracaoResumo,
    LicencaVencendoResumo,
    ResumoMonitoramentoRead,
)
from app.services.monitoramento_divergencias import divergencia_conclusao


def _fase_atual_id(fases_gerais_desc: list[MarcoCatalogo], marco_ids_com_evento: set[int]) -> int | None:
    """Mesma regra ja usada no front (MonitoramentoInterno.tsx): marco de
    fase_geral de MAIOR ordem que tem pelo menos 1 evento lancado --
    `fases_gerais_desc` ja vem ordenado por `ordem` decrescente."""
    for f in fases_gerais_desc:
        if f.id in marco_ids_com_evento:
            return f.id
    return None


def _acumular_divergencia_conclusao(
    *,
    instrumento,
    fase_atual,
    eventos_instrumento,
    propostas_por_chave,
    divergencias: list[DivergenciaConclusaoRead],
    por_fonte: Counter[str],
) -> None:
    fase_concluida = bool(
        fase_atual
        and fase_atual.codigo == "fase_concluido"
        and any(evento.marco_id == fase_atual.id and evento.data_ocorrencia for evento in eventos_instrumento)
    )
    if not fase_concluida:
        return
    divergencia = divergencia_conclusao(
        instrumento,
        fase_concluida=True,
        proposta=propostas_por_chave.get(instrumento.nr_convenio),
    )
    if divergencia is None:
        return
    divergencias.append(
        DivergenciaConclusaoRead(
            nr_convenio=instrumento.nr_convenio,
            nome_convenente=instrumento.nome_convenente,
            tipo_contratacao=instrumento.tipo_contratacao,
            fase_interna=fase_atual.rotulo,
            fonte_externa=divergencia.fonte_externa,
            status_externo_original=divergencia.status_externo_original,
            status_externo_normalizado=divergencia.status_externo_normalizado,
            atualizado_em=divergencia.atualizado_em,
            risco="Conclusão externa pendente",
        )
    )
    por_fonte[divergencia.fonte_externa] += 1


def montar_resumo_monitoramento(db: Session) -> ResumoMonitoramentoRead:
    """Pagina de overview independente (achado 2026-09-09, pedido do
    usuario) -- 1 chamada so, tudo calculado a partir do NOSSO schema (ver
    docstring de ResumoMonitoramentoRead pro que fica de fora de
    proposito).

    Eventos sao filtrados no banco pelos marcos necessarios (fase_geral +
    licenca CNEN + inauguracao) -- nao carrega o historico inteiro de
    EventoMarco. Contagens de acao tambem sao agregadas no SQL."""
    hoje = date.today()
    dados = monitoramento_repo.carregar_dados_resumo_monitoramento(db, hoje=hoje)
    instrumentos = dados.instrumentos
    propostas_por_chave = dados.propostas_por_chave
    marcos = dados.marcos
    fases_gerais_desc = sorted(
        (m for m in marcos if m.grupo == MarcoGrupo.fase_geral),
        key=lambda m: m.ordem or 0,
        reverse=True,
    )
    marco_licenca = next((m for m in marcos if m.codigo == "regulatorio_licenca_operacao"), None)
    marco_inauguracao = next((m for m in marcos if m.codigo == "cronograma_previsao_inauguracao"), None)

    eventos_por_instrumento = dados.eventos_por_instrumento
    pcts = []
    contagem_fase: Counter[str] = Counter()
    contagem_tecnico: Counter[str] = Counter()
    licencas_deferidas = 0
    licencas_vencendo: list[LicencaVencendoResumo] = []
    inauguracoes: list[InauguracaoResumo] = []
    divergencias_conclusao: list[DivergenciaConclusaoRead] = []
    divergencias_por_fonte: Counter[str] = Counter()

    for inst in instrumentos:
        eventos_inst = eventos_por_instrumento.get(inst.id, [])
        marco_ids_com_evento = {e.marco_id for e in eventos_inst}

        fase_atual_id = _fase_atual_id(fases_gerais_desc, marco_ids_com_evento)
        fase_atual = next((f for f in fases_gerais_desc if f.id == fase_atual_id), None)
        if fase_atual and fase_atual.execucao_fisica_pct_referencia is not None:
            pcts.append(fase_atual.execucao_fisica_pct_referencia)
        contagem_fase[fase_atual.rotulo if fase_atual else "Não iniciado"] += 1

        _acumular_divergencia_conclusao(
            instrumento=inst,
            fase_atual=fase_atual,
            eventos_instrumento=eventos_inst,
            propostas_por_chave=propostas_por_chave,
            divergencias=divergencias_conclusao,
            por_fonte=divergencias_por_fonte,
        )

        # Achado 2026-09-09 (pedido do usuario): NA/NI ja viram NULL na
        # importacao/migration -- sempre conta, nunca pula, com rotulo
        # proprio pra quem ainda nao tem tecnico definido (antes ficava de
        # fora da distribuicao silenciosamente).
        contagem_tecnico[inst.tecnico_titular or "Sem técnico definido"] += 1

        if marco_licenca:
            evs_licenca = [e for e in eventos_inst if e.marco_id == marco_licenca.id]
            if evs_licenca and any(e.status_regulatorio == "Deferido" for e in evs_licenca):
                licencas_deferidas += 1
            # Evento mais recente com data_validade preenchida -- mesma
            # regra ja usada no front (MonitoramentoInterno.tsx) pro
            # contador de vencimento no detalhe do instrumento.
            # Desempate por id além de created_at (achado ao vivo,
            # convênio 947527) -- carga em lote grava vários eventos do
            # mesmo marco com o MESMO created_at (timestamp do processo).
            ev_validade = max(
                (e for e in evs_licenca if e.data_validade),
                key=lambda e: (e.created_at, e.id),
                default=None,
            )
            if ev_validade:
                assert ev_validade.data_validade is not None
                licencas_vencendo.append(
                    LicencaVencendoResumo(
                        nr_convenio=inst.nr_convenio,
                        nome_convenente=inst.nome_convenente,
                        data_validade=ev_validade.data_validade,
                        dias=(ev_validade.data_validade - hoje).days,
                    )
                )

        if marco_inauguracao:
            evs_inaug = [e for e in eventos_inst if e.marco_id == marco_inauguracao.id]
            # Mais recente por (created_at, id) -- so 1 por instrumento na
            # lista; id desempata created_at empatado (ver comentario acima).
            ev = max(evs_inaug, key=lambda e: (e.created_at, e.id), default=None)
            if ev:
                data = ev.data_ocorrencia or ev.data_prevista
                if data:
                    # Descricao PLANEJADA (SICONV) primeiro, cai pro FISICO
                    # (marca+modelo, so preenchido depois da entrega) --
                    # mesma prioridade conceitual do resto do schema (ver
                    # docstring da secao 8 em app/db/models.py).
                    equipamento = inst.equipamento_descricao or (
                        f"{inst.equipamento_marca} {inst.equipamento_modelo}".strip()
                        if inst.equipamento_marca or inst.equipamento_modelo
                        else None
                    )
                    inauguracoes.append(
                        InauguracaoResumo(
                            nr_convenio=inst.nr_convenio,
                            nome_convenente=inst.nome_convenente,
                            municipio=inst.municipio,
                            uf=inst.uf,
                            equipamento=equipamento,
                            data=data,
                            realizada=ev.data_ocorrencia is not None,
                            dias=(data - hoje).days,
                        )
                    )

    inauguracoes.sort(key=lambda i: i.data)
    licencas_vencendo.sort(key=lambda i: i.data_validade)

    return ResumoMonitoramentoRead(
        total_instrumentos=len(instrumentos),
        pct_execucao_fisica_medio=(sum(pcts) / len(pcts)) if pcts else None,
        distribuicao_fase=[ContagemRotulo(rotulo=r, quantidade=q) for r, q in contagem_fase.most_common()],
        licencas_cnen_deferidas=licencas_deferidas,
        licencas_vencendo=licencas_vencendo,
        por_tecnico_titular=[ContagemRotulo(rotulo=r, quantidade=q) for r, q in contagem_tecnico.most_common()],
        inauguracoes=inauguracoes,
        acoes_pendentes=dados.acoes_pendentes,
        acoes_atrasadas=dados.acoes_atrasadas,
        nr_convenios=[i.nr_convenio for i in instrumentos],
        divergencias_conclusao=sorted(divergencias_conclusao, key=lambda item: item.nr_convenio),
        divergencias_conclusao_por_fonte=[
            ContagemRotulo(rotulo=rotulo, quantidade=quantidade)
            for rotulo, quantidade in divergencias_por_fonte.most_common()
        ],
    )
