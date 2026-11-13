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

const FASE_NAO_INICIADO = "Não iniciado";
const FASE_CONCLUIDO = "Concluído";

/** Cor estável por fase: depende só do rótulo e da posição no catálogo, nunca
 * do ranking por quantidade. Não iniciado e Concluído nunca coincidem. */
export function corDaFase(rotulo: string, fases: readonly string[]): string {
  if (rotulo === FASE_NAO_INICIADO) return "var(--painel-fase-nao-iniciado)";
  if (rotulo === FASE_CONCLUIDO) return "var(--painel-fase-concluido)";
  const intermediarias = fases.filter(
    (fase) => fase !== FASE_NAO_INICIADO && fase !== FASE_CONCLUIDO,
  );
  const indice = Math.max(0, intermediarias.indexOf(rotulo));
  const passo =
    intermediarias.length > 1 ? indice / (intermediarias.length - 1) : 0.5;
  const fim = Math.round(passo * 100);
  return `color-mix(in srgb, var(--painel-fase-inicio) ${100 - fim}%, var(--painel-fase-fim) ${fim}%)`;
}

const CORES_CONTRATACAO: Record<string, string> = {
  Convênio: "var(--painel-chart-magenta)",
  FAF: "var(--painel-chart-turquesa)",
  TED: "var(--painel-chart-oliva)",
  "PERSUS I": "var(--painel-chart-terra)",
  "PERSUS II": "var(--painel-chart-celeste)",
};

/** Cor fixa por tipo de contratação (sem azul/âmbar, reservados a realizadas
 * e previstas). O que não tem cor própria cai no neutro; o rótulo identifica. */
export function corDaContratacao(rotulo: string): string {
  return CORES_CONTRATACAO[rotulo] ?? "var(--painel-chart-ardosia)";
}

/** Rankings independentes (equipamento, técnico) usam uma cor só, sem sugerir
 * correspondência cromática entre dimensões. */
export const COR_RANKING = "var(--painel-chart-ardosia)";
