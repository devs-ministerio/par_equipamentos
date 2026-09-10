import type { StatusCobertura } from '../types/domain';

/** `variant` em vez de hex direto (desde 2026-09-10) -- quem precisa do
 * className usa `variant` direto (StatusBadge); quem precisa do hex real
 * pra desenho imperativo (MacroMap.tsx, D3/Leaflet) resolve
 * `--${variant}` via src/lib/theme-colors.ts::resolveThemeColor, em vez
 * de statusMeta devolver hex cru duplicado das variaveis de index.css. */
export function statusMeta(cobertura: number): { label: StatusCobertura; variant: 'success' | 'destructive' } {
  if (cobertura >= 100) return { label: 'Hiperssuficiente', variant: 'success' };
  return { label: 'Hipossuficiente', variant: 'destructive' };
}
