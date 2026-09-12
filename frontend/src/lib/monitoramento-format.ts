/** Dias até `dataIso` (negativo = já venceu) -- usado no contador de
 * validade da licença de operação e no prazo de ações/inaugurações. `null`
 * quando não há data pra calcular. Movido de MonitoramentoInterno.tsx
 * (Seção 6 da migração) pra ser reaproveitado pelos subcomponentes depois
 * do split, sem duplicar a mesma conta em 3 arquivos. */
export function diasAte(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataIso + 'T00:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

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
