import type { StatusCobertura } from '../types/domain';

/** `variant` em vez de hex direto (desde 2026-09-10) -- quem precisa do
 * className usa `variant` direto (StatusBadge); quem precisa do hex real
 * pra desenho imperativo (MacroMap.tsx, D3/Leaflet) resolve
 * `--${variant}` via src/lib/theme-colors.ts::resolveThemeColor, em vez
 * de statusMeta devolver hex cru duplicado das variaveis de index.css. */
export function statusMeta(status: StatusCobertura): {
  label: StatusCobertura;
  variant: 'success' | 'destructive' | 'secondary';
} {
  if (status === 'Hiperssuficiente') return { label: status, variant: 'success' };
  if (status === 'Hipossuficiente') return { label: status, variant: 'destructive' };
  return { label: status, variant: 'secondary' };
}
