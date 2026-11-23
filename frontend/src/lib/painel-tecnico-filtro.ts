import type { LinhaCarteira } from "@/services/painel-tecnico";

export type FiltroCarteira =
  | "todos"
  | "faltam"
  | "sem-registro"
  | "atrasadas"
  | "recentes";

export const ROTULO_FILTRO: Record<FiltroCarteira, string> = {
  todos: "Toda a carteira",
  faltam: "Faltam incluir",
  "sem-registro": "Sem registro",
  atrasadas: "Ações atrasadas",
  recentes: "Lançamentos nos últimos 15 dias",
};

export function aplicaFiltro(l: LinhaCarteira, f: FiltroCarteira): boolean {
  if (f === "faltam") return !l.monitorado;
  if (f === "sem-registro") return l.sem_registro;
  if (f === "atrasadas") return l.acoes_atrasadas > 0;
  if (f === "recentes") return l.lancado_recente;
  return true;
}
