import { campo, campoNum, campoObjeto, lista } from '@/lib/campo-cru';
import { equipamentoTagDe, equipamentosDeDescricoes, type EquipamentoAlvo } from '@/lib/equipamento-tags';

/** `metas_resumo` é dado cru da API do TransfereGov, sem schema fixo de
 * propósito (ver docstring de `campo-cru.ts`) -- os helpers abaixo
 * transformam esse dado bruto em tipos concretos (string/number/array de
 * evento), pra que o resto da UI (proposta-card.tsx, secao-propostas-
 * candidatas.tsx) nunca precise tocar `Record<string, unknown>` direto. */

/** Equipamento em destaque na camada 1 do card -- pega o item de MAIOR
 * VALOR dentro de /item-proposta (dado real, já capturado em
 * metas_resumo), então sempre acha algo quando a proposta tem item
 * detalhado. Diferente de `equipamento_detectado` (regex contra
 * PADROES_EQUIPAMENTO, fica null pra qualquer item fora do rol de
 * equipamento de imagem grande, ex. colposcópio/bisturi).
 *
 * `nome` é sempre o nome CURTO e padronizado do equipamento (ex.
 * "Acelerador Linear"), nunca o `nm_item` cru -- achado 2026-09-18,
 * pedido do usuário: o texto original da API vem verboso e inconsistente
 * item a item (ex. "UPGRADE DO ACELERADOR LINEAR DA RADIOTERAPIA"). Cai
 * pro texto cru só quando nenhum padrão conhecido bate (nunca inventa um
 * nome de equipamento que a fonte não confirma). */
export function equipamentoPrincipal(metasResumo: unknown): { nome: string; valor: number | null } | null {
  const metas = lista(metasResumo, 'metas');
  let melhor: { nome: string; valor: number | null } | null = null;
  for (const m of metas) {
    for (const e of lista(m, 'etapas_proposta')) {
      for (const it of lista(e, 'itens')) {
        const nome = campo(it, 'nm_item');
        if (!nome) continue;
        const valor = campoNum(it, 'vl_total_item');
        if (!melhor || (valor ?? -1) > (melhor.valor ?? -1)) melhor = { nome, valor };
      }
    }
  }
  if (!melhor) return null;
  const tag = equipamentoTagDe(melhor.nome);
  return tag ? { nome: tag, valor: melhor.valor } : melhor;
}

/** Tags de equipamento (EQUIPAMENTOS_ALVO) pra filtro -- classifica direto
 * contra TODOS os itens de `metas_resumo` (mesmos 14 padrões de
 * equipamento-tags.ts), não só o de maior valor (`equipamentoPrincipal`
 * acima), então pega qualquer equipamento-alvo presente mesmo quando não é
 * o item mais caro. */
export function equipamentosDaProposta(metasResumo: unknown): EquipamentoAlvo[] {
  const nomes: string[] = [];
  for (const m of lista(metasResumo, 'metas')) {
    for (const e of lista(m, 'etapas_proposta')) {
      for (const it of lista(e, 'itens')) {
        const nome = campo(it, 'nm_item');
        if (nome) nomes.push(nome);
      }
    }
  }
  return equipamentosDeDescricoes(nomes);
}

export function enderecoProposta(proposta: unknown): string | null {
  const partes = [
    campo(proposta, 'ed_logradouro'),
    campo(proposta, 'ed_numero'),
    campo(proposta, 'ed_complemento'),
    campo(proposta, 'ed_bairro'),
    campo(proposta, 'ed_cep'),
  ].filter(Boolean);
  return partes.length ? partes.join(', ') : null;
}

export interface EventoTimeline {
  data: string;
  titulo: string;
  detalhe?: string;
}

/** Linha do tempo da proposta -- todas as etapas que ela já passou, em
 * ordem cronológica, até a mais recente. Só inclui etapa que tem DATA
 * real -- nunca inventa uma pra completar a sequência. */
export function construirTimelineProposta(metasResumo: unknown, dataProposta: string | null): EventoTimeline[] {
  const eventos: EventoTimeline[] = [];

  if (dataProposta) {
    eventos.push({ data: dataProposta, titulo: 'Proposta enviada' });
  }

  for (const a of lista(metasResumo, 'analise')) {
    const data = campo(a, 'dh_analise_proposta');
    if (data) {
      const tipos = lista(a, 'tipos_analise').map((t) => campo(t, 'tp_analise')).filter(Boolean).join(', ');
      eventos.push({
        data: data.slice(0, 10),
        titulo: `Análise técnica${tipos ? ` (${tipos})` : ''}`,
        detalhe: campo(a, 'in_resultado_analise') ?? undefined,
      });
    }
  }

  const tl = campoObjeto(metasResumo, 'timeline_financeira');
  if (tl) {
    for (const e of lista(tl, 'empenhos')) {
      const data = campo(e, 'data_emissao');
      if (data) eventos.push({ data: data.slice(0, 10), titulo: 'Empenho emitido (SIAFI)', detalhe: campo(e, 'in_situacao_siafi') ?? undefined });
    }
    for (const d of lista(tl, 'documentos_habeis')) {
      const data = campo(d, 'dt_emissao');
      if (data) eventos.push({ data: data.slice(0, 10), titulo: 'Documento hábil emitido', detalhe: campo(d, 'in_situacao_dh') ?? undefined });
    }
    for (const o of lista(tl, 'ordens_pagamento')) {
      const dataOp = campo(o, 'dt_emissao_op');
      if (dataOp) eventos.push({ data: dataOp.slice(0, 10), titulo: 'Ordem de pagamento emitida', detalhe: campo(o, 'in_situacao_op') ?? undefined });
      const dataOb = campo(o, 'dt_emissao_ordem_bancaria');
      if (dataOb) eventos.push({ data: dataOb.slice(0, 10), titulo: 'Ordem bancária emitida' });
    }
  }

  eventos.sort((a, b) => a.data.localeCompare(b.data));
  return eventos;
}
