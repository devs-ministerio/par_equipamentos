/** Destino de retorno após o login: caminho interno com parâmetros e
 * fragmento. Só aceita caminho do próprio site (começa com uma única "/"),
 * nunca outro host nem a própria tela de login. */
export function destinoSeguro(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length > 2000) return null;
  if (!valor.startsWith("/") || valor.startsWith("//")) return null;
  if (valor.includes("\\")) return null;
  for (let i = 0; i < valor.length; i += 1) {
    if (valor.charCodeAt(i) < 32) return null;
  }
  const caminho = valor.split(/[?#]/)[0];
  if (caminho === "/login") return null;
  return valor;
}

export function destinoDe(local: {
  pathname: string;
  search: string;
  hash: string;
}): string {
  return `${local.pathname}${local.search}${local.hash}`;
}
