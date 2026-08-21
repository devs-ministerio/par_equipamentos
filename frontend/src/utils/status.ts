import type { StatusCobertura } from '../types/domain';

export function statusMeta(cobertura: number): { label: StatusCobertura; color: string; bg: string } {
  if (cobertura >= 100) return { label: 'Hiperssuficiente', color: '#2F6A1D', bg: '#eaf3e0' };
  return { label: 'Hipossuficiente', color: '#B40D0D', bg: '#fde8e8' };
}
