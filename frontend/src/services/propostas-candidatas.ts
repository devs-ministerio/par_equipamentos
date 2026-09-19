import { z } from 'zod';
import { apiAuthed, apiGetAuthed } from './monitoramento-client';

// ---------------------------------------------------------------------
// Radar de Convênios -- propostas candidatas (backend/app/routers/propostas_candidatas.py)
// ---------------------------------------------------------------------

const propostaCandidataStatusSchema = z.enum(['pendente', 'aceita', 'rejeitada']);
export type PropostaCandidataStatus = z.infer<typeof propostaCandidataStatusSchema>;

const propostaCandidataSchema = z.object({
  id: z.number(),
  id_proposta: z.number(),
  cnpj_ente_recebedor: z.string(),
  nm_proponente: z.string(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  ds_objeto: z.string(),
  nm_programa: z.string(),
  id_programa: z.number(),
  componente_batido: z.string(),
  equipamento_detectado: z.string().nullable(),
  vl_global_proposta: z.number().nullable(),
  situacao_proposta: z.string().nullable(),
  data_proposta: z.string().nullable(),
  metas_resumo: z.record(z.string(), z.unknown()).nullable(),
  cnes: z.string().nullable(),
  cnes_nome_estabelecimento: z.string().nullable(),
  tem_parceria: z.boolean(),
  cd_parceria: z.string().nullable(),
  status: propostaCandidataStatusSchema,
  revisado_por: z.number().nullable(),
  revisado_em: z.string().nullable(),
  created_at: z.string(),
});
export type PropostaCandidata = z.infer<typeof propostaCandidataSchema>;

const propostaCandidataListaSchema = z.object({
  total: z.number(),
  itens: z.array(propostaCandidataSchema),
});

export interface FetchPropostasCandidatasOpts {
  status?: PropostaCandidataStatus;
  uf?: string;
  busca?: string;
  ano?: number;
  idPrograma?: number;
  pagina?: number;
  /** Default 500 -- mesmo padrão transitório de `fetchConvenios`: filtros
   * derivados de `metas_resumo` (equipamento / situação de fato / "novas")
   * ainda rodam no cliente, então a página pede o universo de uma vez. */
  tamanhoPagina?: number;
}

export function fetchPropostasCandidatas(
  opts: FetchPropostasCandidatasOpts | PropostaCandidataStatus = {},
): Promise<{ total: number; itens: PropostaCandidata[] }> {
  // Compat: chamada antiga `fetchPropostasCandidatas('pendente')`.
  const params = typeof opts === 'string' ? { status: opts } : opts;
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.uf) qs.set('uf', params.uf);
  if (params.busca) qs.set('busca', params.busca);
  if (params.ano != null) qs.set('ano', String(params.ano));
  if (params.idPrograma != null) qs.set('id_programa', String(params.idPrograma));
  qs.set('pagina', String(params.pagina ?? 1));
  qs.set('tamanho_pagina', String(params.tamanhoPagina ?? 500));
  const query = qs.toString() ? `?${qs}` : '';
  return apiGetAuthed(`/propostas-candidatas${query}`, propostaCandidataListaSchema);
}

export function revisarPropostaCandidata(
  propostaId: number,
  decisao: 'aceita' | 'rejeitada',
): Promise<PropostaCandidata> {
  return apiAuthed(`/propostas-candidatas/${propostaId}/revisar`, propostaCandidataSchema, 'POST', { decisao });
}
