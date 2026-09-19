import { fmtData } from '@/lib/monitoramento-format';

/** `metas_resumo` é dado cru da API do TransfereGov (Record<string,
 * unknown>, sem schema fixo de propósito -- ver docstring do campo em
 * app/db/models.py) -- helpers abaixo leem campo a campo com fallback,
 * nunca assumem que existe. */
export function campo(obj: unknown, chave: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[chave];
  return typeof v === 'string' && v.trim() ? v : null;
}

export function campoNum(obj: unknown, chave: string): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[chave];
  return typeof v === 'number' ? v : null;
}

/** Alguns campos crus vêm como número na API mesmo sendo "código" (ex.
 * cd_parceria, numero_empenho) -- diferente de `campo` (só string). */
export function campoTexto(obj: unknown, chave: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[chave];
  if (typeof v === 'string' && v.trim()) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

/** `fmtData` só entende "aaaa-mm-dd" -- vários campos da API vêm como
 * datetime ISO completo ("2025-12-26T00:00:00"), corta só a parte da
 * data antes de formatar (achado 2026-09-15, testado ao vivo: sem isso
 * virava "26T00:00:00/12/2025"). */
export function campoData(obj: unknown, chave: string): string {
  const v = campo(obj, chave);
  return v ? fmtData(v.slice(0, 10)) : '—';
}

export function lista<T = Record<string, unknown>>(obj: unknown, chave: string): T[] {
  if (!obj || typeof obj !== 'object') return [];
  const v = (obj as Record<string, unknown>)[chave];
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Sub-objeto cru (ex. `metas_resumo.timeline_financeira`/`.parceria`) --
 * `null` quando ausente ou de tipo inesperado, nunca lança. */
export function campoObjeto(obj: unknown, chave: string): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[chave];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
