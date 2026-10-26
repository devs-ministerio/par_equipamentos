/** Cores de dados, não de status. Sempre combinar com rótulo/contagem. */
export const PALETA_CATEGORICA = [
  "var(--painel-chart-azul)",
  "var(--painel-chart-ambar)",
  "var(--painel-chart-magenta)",
  "var(--painel-chart-roxo)",
  "var(--painel-chart-oliva)",
  "var(--painel-chart-ardosia)",
] as const;

export const COR_REALIZADA = PALETA_CATEGORICA[0];
export const COR_PREVISTA = PALETA_CATEGORICA[1];
