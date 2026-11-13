import { fmtData } from "@/lib/monitoramento-format";

export interface Acompanhamento {
  inauguracao_data: string | null;
  inauguracao_realizada: boolean;
  entrega_data: string | null;
  conferencia: string | null;
}

/** Linha de leitura da inauguração no cartão: data real, previsão ou ausência, sem inferir nada. */
export function rotuloInauguracao(a: Acompanhamento | null): string {
  if (!a?.inauguracao_data) return "Sem data de inauguração";
  return a.inauguracao_realizada
    ? `Inaugurado em ${fmtData(a.inauguracao_data)}`
    : `Inauguração prevista para ${fmtData(a.inauguracao_data)}`;
}
