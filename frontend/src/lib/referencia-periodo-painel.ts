/** Referência temporal do recorte do Painel (D41): o filtro de ano pode olhar o ano do instrumento (padrão)
 * ou a data do evento de inauguração, real ou prevista. Nenhuma data é inferida. */
export type ReferenciaPeriodo =
  | "ano_instrumento"
  | "inicio_operacao"
  | "inauguracao_realizada"
  | "inauguracao_prevista";

export const OPCOES_REFERENCIA: Array<{
  value: ReferenciaPeriodo;
  label: string;
}> = [
  { value: "inauguracao_realizada", label: "Inauguração realizada" },
  { value: "inauguracao_prevista", label: "Inauguração prevista" },
];

export const OPCOES_REFERENCIA_GESTAO = [
  { value: "ano_instrumento", label: "Ano do instrumento" },
  { value: "inicio_operacao", label: "Início de operação" },
  { value: "inauguracao_prevista", label: "Inauguração prevista" },
] as const;

export function referenciaValida(
  valor: string | null,
  comInicioOperacao = false,
): ReferenciaPeriodo {
  if (
    comInicioOperacao &&
    (valor === "inicio_operacao" || valor === "inauguracao_realizada")
  )
    return "inicio_operacao";
  return valor === "inauguracao_realizada" || valor === "inauguracao_prevista"
    ? valor
    : "ano_instrumento";
}

export interface DataDeInauguracao {
  nr_convenio: string;
  data: string;
  realizada: boolean;
}

/** Ano (aaaa) do evento de cada instrumento para a referência escolhida; ausente = sem data nessa referência. */
export function anosPorReferencia(
  referencia: ReferenciaPeriodo,
  inauguracoes: readonly DataDeInauguracao[],
): Map<string, number> {
  const anos = new Map<string, number>();
  if (
    referencia !== "inauguracao_realizada" &&
    referencia !== "inauguracao_prevista"
  )
    return anos;
  const realizada = referencia === "inauguracao_realizada";
  for (const item of inauguracoes) {
    if (item.realizada === realizada)
      anos.set(item.nr_convenio, Number(item.data.slice(0, 4)));
  }
  return anos;
}
