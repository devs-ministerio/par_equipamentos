import { normalizarTexto } from "@/utils/texto";

/** Busca local sem diferenciar acentos ou caixa, sobre os campos disponíveis em cada fonte. */
export function correspondeBuscaLivre(
  busca: string,
  campos: ReadonlyArray<string | number | null | undefined>,
): boolean {
  const termo = normalizarTexto(busca.trim());
  if (!termo) return true;
  return campos.some((campo) =>
    normalizarTexto(String(campo ?? "")).includes(termo),
  );
}
