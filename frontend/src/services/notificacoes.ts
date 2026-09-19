import { z } from 'zod';
import { requisitar } from '@/lib/http-client';
import { apiAuthed } from './monitoramento-client';

// ---------------------------------------------------------------------
// Radar de Convênios -- notificações (backend/app/routers/notificacoes.py)
// ---------------------------------------------------------------------

const notificacaoTipoSchema = z.enum(['proposta_candidata', 'atualizacao_api', 'edicao_manual']);
export type NotificacaoTipo = z.infer<typeof notificacaoTipoSchema>;

const notificacaoSchema = z.object({
  id: z.number(),
  tipo: notificacaoTipoSchema,
  titulo: z.string(),
  corpo: z.string().nullable(),
  entidade_id: z.number(),
  nivel_minimo: z.string().nullable(),
  lida: z.boolean(),
  created_at: z.string(),
  destino: z.string().nullable(),
});
export type Notificacao = z.infer<typeof notificacaoSchema>;

const notificacoesListSchema = z.object({
  itens: z.array(notificacaoSchema),
  total: z.number(),
  nao_lidas: z.number(),
});
export type NotificacoesList = z.infer<typeof notificacoesListSchema>;

export function fetchNotificacoes(opts?: { limit?: number; apenasNaoLidas?: boolean }): Promise<NotificacoesList> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.apenasNaoLidas) params.set('apenas_nao_lidas', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  return requisitar(`/notificacoes${query}`, notificacoesListSchema, undefined);
}

export function marcarNotificacaoLida(notificacaoId: number): Promise<Notificacao> {
  return apiAuthed(`/notificacoes/${notificacaoId}`, notificacaoSchema, 'PATCH');
}
