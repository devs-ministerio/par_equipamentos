/** NUP do SEI em dígitos (17) -> `25000.198305/2024-59`. Outro formato volta como veio. */
export function formatarNup(valor: string): string {
  const d = valor.replace(/\D/g, "");
  if (d.length !== 17 || d !== valor.trim()) return valor;
  return `${d.slice(0, 5)}.${d.slice(5, 11)}/${d.slice(11, 15)}-${d.slice(15)}`;
}

/** Só FAF e TED têm o NUP como identificador oficial. */
export function nupDoInstrumento(
  tipoContratacao: string | null | undefined,
  nrConvenio: string,
): string | null {
  if (tipoContratacao !== "FAF" && tipoContratacao !== "TED") return null;
  const nup = formatarNup(nrConvenio);
  return nup === nrConvenio ? null : nup;
}
