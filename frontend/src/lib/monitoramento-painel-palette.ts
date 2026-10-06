/** Cores de dados, não de status. Sempre combinar com rótulo/contagem. */
export const PALETA_CATEGORICA = [
  "var(--painel-chart-teal)",
  "var(--painel-chart-blue)",
  "var(--painel-chart-ochre)",
  "var(--painel-chart-plum)",
  "var(--painel-chart-olive)",
  "var(--painel-chart-slate)",
] as const;

export const COR_REALIZADA = PALETA_CATEGORICA[0];
export const COR_PREVISTA = PALETA_CATEGORICA[1];
