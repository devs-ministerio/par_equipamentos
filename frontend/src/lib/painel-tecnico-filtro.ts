import type { LinhaCarteira } from "@/services/painel-tecnico";

export type FiltroCarteira =
  | "todos"
  | "faltam"
  | "sem-registro"
  | "concluidos"
  | "recentes";

export const ROTULO_FILTRO: Record<FiltroCarteira, string> = {
  todos: "Toda a carteira",
  faltam: "Faltam incluir",
  "sem-registro": "Sem registro",
  concluidos: "Concluídos",
  recentes: "Lançamentos nos últimos 15 dias",
};

export function aplicaFiltro(l: LinhaCarteira, f: FiltroCarteira): boolean {
  if (f === "faltam") return !l.monitorado;
  if (f === "sem-registro") return l.sem_registro;
  if (f === "concluidos") return l.monitorado && l.fase === "Concluído";
  if (f === "recentes") return l.lancado_recente;
  return true;
}
