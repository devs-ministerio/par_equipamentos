import { z } from 'zod';
import { apiAuthed, apiGetAuthed } from './monitoramento-client';

// ---------------------------------------------------------------------
// Monitoramento -- ações
// ---------------------------------------------------------------------

const acaoMonitoramentoSchema = z.object({
  id: z.number(),
  instrumento_id: z.number(),
  nr_convenio: z.string(),
  descricao: z.string(),
  data_prevista: z.string().nullable(),
  data_conclusao: z.string().nullable(),
  responsavel: z.string().nullable(),
  created_at: z.string(),
});
export type AcaoMonitoramento = z.infer<typeof acaoMonitoramentoSchema>;

export function fetchAcoes(pendentes?: boolean): Promise<AcaoMonitoramento[]> {
  const query = pendentes ? '?pendentes=true' : '';
  return apiGetAuthed(`/monitoramento/acoes${query}`, z.array(acaoMonitoramentoSchema));
}

export interface CriarAcaoInput {
  descricao: string;
  data_prevista?: string | null;
  responsavel?: string | null;
}

export function criarAcao(nrConvenio: string, corpo: CriarAcaoInput): Promise<AcaoMonitoramento> {
  return apiAuthed(`/monitoramento/instrumentos/${nrConvenio}/acoes`, acaoMonitoramentoSchema, 'POST', corpo);
}

export function concluirAcao(acaoId: number): Promise<AcaoMonitoramento> {
  return apiAuthed(`/monitoramento/acoes/${acaoId}/concluir`, acaoMonitoramentoSchema, 'PATCH');
}
