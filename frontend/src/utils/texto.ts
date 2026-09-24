/** Remove acentos e ignora caixa -- "Sao Paulo" precisa achar "São Paulo" e vice-versa. */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
