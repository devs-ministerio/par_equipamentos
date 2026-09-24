/** Formata um numero grande como "23,4k" (1 casa decimal, separador BR). Abaixo de 1000, mostra o inteiro puro. */
export function formatMilhar(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return Math.round(n).toString();
}

/** Formata um multiplicador como "3,90x" (2 casas decimais, separador BR). */
export function formatMultiplicador(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}x`;
}
