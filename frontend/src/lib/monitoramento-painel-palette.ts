/** Cores de dados, não de status. Sempre combinar com rótulo/contagem. Duas
 * cores do mesmo gráfico nunca ficam parecidas (distância Lab ≥ 25, ver teste). */
export const PALETA_CATEGORICA = [
  "var(--painel-chart-azul)",
  "var(--painel-chart-ambar)",
  "var(--painel-chart-magenta)",
  "var(--painel-chart-turquesa)",
  "var(--painel-chart-oliva)",
  "var(--painel-chart-ardosia)",
  "var(--painel-chart-terra)",
  "var(--painel-chart-celeste)",
] as const;

export const COR_REALIZADA = PALETA_CATEGORICA[0];
export const COR_PREVISTA = PALETA_CATEGORICA[1];
