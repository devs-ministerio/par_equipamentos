import type { SingleSelectOption } from "@/components/common/single-select-filter";

export type OrigemSituacao = "instrumento" | "monitoramento" | "proposta";

const ROTULO_GRUPO: Record<OrigemSituacao, string> = {
  instrumento: "Instrumento",
  monitoramento: "Monitoramento",
  proposta: "Proposta",
};
const ORIGENS = Object.keys(ROTULO_GRUPO) as OrigemSituacao[];

/** O valor escolhido leva a origem junto: "Em execução" existe em mais de uma fonte. */
export function codificarSituacao(origem: OrigemSituacao, valor: string) {
  return `${origem}|${valor}`;
}

export function decodificarSituacao(
  codigo: string | null,
): { origem: OrigemSituacao; valor: string } | null {
  if (!codigo) return null;
  const [origem, ...resto] = codigo.split("|");
  if (!ORIGENS.includes(origem as OrigemSituacao) || resto.length === 0)
    return null;
  return { origem: origem as OrigemSituacao, valor: resto.join("|") };
}

/** Lista única de Situação, agrupada por origem; origem sem valores não aparece. */
export function opcoesSituacao(
  valores: Record<OrigemSituacao, string[]>,
): SingleSelectOption[] {
  return ORIGENS.flatMap((origem) =>
    [...new Set(valores[origem])]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((valor) => ({
        value: codificarSituacao(origem, valor),
        label: valor,
        group: ROTULO_GRUPO[origem],
      })),
  );
}
