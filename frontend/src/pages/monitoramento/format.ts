export function fmtMoeda(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** Aceita tanto "dd/mm/aaaa" (dump SICONV) quanto "aaaa-mm-dd" (Portal da
 * Transparencia / API interna) e sempre devolve dd/mm/aaaa. */
export function fmtData(s: string | null | undefined): string {
  if (!s) return '—';
  if (s.includes('/')) return s;
  const [ano, mes, dia] = s.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** "71% do global" -- legenda curta pra por embaixo de um valor monetario
 * (ver Campo em ui.tsx). `undefined` quando falta numerador ou denominador
 * (nunca mostra "0%" ou "NaN%" por dado ausente). */
export function pct(parte: number | null | undefined, total: number | null | undefined, sufixo: string): string | undefined {
  if (parte == null || !total) return undefined;
  return `${Math.round((parte / total) * 100)}% ${sufixo}`;
}
