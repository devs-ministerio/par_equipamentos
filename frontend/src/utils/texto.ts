/** Remove acentos e ignora caixa -- "Sao Paulo" precisa achar "São Paulo" e vice-versa. */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "SAO PAULO"/"são paulo" -> "São Paulo" -- só resolve maiúsculo/minúsculo,
 * não reconstrói acento que a fonte nunca tinha (não dá pra adivinhar "São"
 * a partir de "SAO" sem um dicionário de municípios). Usado pra exibir um
 * rótulo consistente quando a mesma cidade chega grafada de jeitos
 * diferentes por origem (achado 2026-09-26, "não da pra ter dois São
 * Paulo um minúsculo, um maiúsculo e um sem acento"). */
export function capitalizarNome(texto: string): string {
  return texto
    .toLowerCase()
    .split(" ")
    .map((parte) =>
      parte ? parte.charAt(0).toUpperCase() + parte.slice(1) : parte,
    )
    .join(" ");
}
