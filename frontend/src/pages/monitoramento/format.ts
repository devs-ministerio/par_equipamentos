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
