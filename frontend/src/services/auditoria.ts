import { z } from "zod";
import { apiGetAuthed } from "./monitoramento-client";

// ---------------------------------------------------------------------
// Trilha de auditoria (Módulo de Auditoria, 2026-09-28,
// backend/app/routers/auditoria.py) -- mesmo formato snake_case dos demais
// services de monitoramento (ver docstring de monitoramento-client.ts).
// ---------------------------------------------------------------------

const auditoriaItemSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  usuario_id: z.number().nullable(),
  usuario_nome: z.string().nullable(),
  usuario_email: z.string().nullable(),
  entity_name: z.string(),
  entity_id: z.number().nullable(),
  action: z.string(),
  details: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditoriaItem = z.infer<typeof auditoriaItemSchema>;

const auditoriaPaginaSchema = z.object({
  itens: z.array(auditoriaItemSchema),
  total: z.number(),
});
export type AuditoriaPagina = z.infer<typeof auditoriaPaginaSchema>;

/** Ações que sinalizam risco de segurança (força bruta, sessão possivelmente
 * roubada) -- só destaque visual na tela, sem alerta proativo (decisão do
 * usuário: visibilidade nesta rodada, não notificação por e-mail/Slack). */
export const ACOES_SEGURANCA = new Set([
  "login_falha",
  "login_bloqueado",
  "refresh_reuso_detectado",
]);

export interface FiltroAuditoria {
  limit?: number;
  offset?: number;
  entity_name?: string;
  action?: string;
  user_id?: number;
  desde?: string;
  ate?: string;
}

export function fetchAuditoria(
  filtro: FiltroAuditoria = {},
): Promise<AuditoriaPagina> {
  const params = new URLSearchParams();
  if (filtro.limit) params.set("limit", String(filtro.limit));
  if (filtro.offset) params.set("offset", String(filtro.offset));
  if (filtro.entity_name) params.set("entity_name", filtro.entity_name);
  if (filtro.action) params.set("action", filtro.action);
  if (filtro.user_id) params.set("user_id", String(filtro.user_id));
  if (filtro.desde) params.set("desde", filtro.desde);
  if (filtro.ate) params.set("ate", filtro.ate);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiGetAuthed(`/auditoria${query}`, auditoriaPaginaSchema);
}
