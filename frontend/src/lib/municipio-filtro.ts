import { capitalizarNome, normalizarTexto } from "@/utils/texto";

/** Identidade de filtro, nunca substitui o município recebido da fonte. */
export function chaveMunicipio(nome: string): string {
  return normalizarTexto(nome.trim().replace(/\s+/g, " "));
}

/** Agrupa grafias sem fuzzy-match; preserva acentos existentes no melhor rótulo.
 * Não reconstrói acentos ausentes, nem decide identidade territorial por UF/IBGE.
 * O recorte por UF continua sendo responsabilidade do consumidor. */
export function opcoesMunicipios(
  nomes: ReadonlyArray<string | null | undefined>,
) {
  const municipios = new Map<
    string,
    { value: string; label: string; total: number }
  >();
  for (const nome of nomes) {
    if (!nome) continue;
    const value = chaveMunicipio(nome);
    if (!value) continue;
    const label = capitalizarNome(
      nome.trim().replace(/\s+/g, " ").normalize("NFC"),
    );
    const anterior = municipios.get(value);
    if (!anterior) {
      municipios.set(value, { value, label, total: 1 });
      continue;
    }
    anterior.total++;
    // A mesma lista em ordem inversa precisa produzir o mesmo rótulo.
    const acentos = label.normalize("NFD").length - label.length;
    const acentosAnteriores =
      anterior.label.normalize("NFD").length - anterior.label.length;
    if (
      acentos > acentosAnteriores ||
      (acentos === acentosAnteriores &&
        label.localeCompare(anterior.label, "pt-BR") < 0)
    )
      anterior.label = label;
  }
  return [...municipios.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR"),
  );
}
