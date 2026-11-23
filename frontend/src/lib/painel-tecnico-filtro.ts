import type { LinhaCarteira } from "@/services/painel-tecnico";

export type FiltroCarteira =
  | "todos"
  | "faltam"
  | "acoes-pendentes"
  | "concluidos"
  | "radar";

export const ROTULO_FILTRO: Record<FiltroCarteira, string> = {
  todos: "Toda a carteira",
  faltam: "Fora do monitoramento",
  "acoes-pendentes": "Ações pendentes",
  concluidos: "Concluídos",
  radar: "Novos Instrumentos (últimos 7 dias)",
};

export const JANELA_RADAR_DIAS = 7;

export function entrouNoRadarRecente(l: LinhaCarteira): boolean {
  if (!l.entrou_radar_em) return false;
  const limite = Date.now() - JANELA_RADAR_DIAS * 86_400_000;
  return new Date(l.entrou_radar_em).getTime() >= limite;
}

export function aplicaFiltro(l: LinhaCarteira, f: FiltroCarteira): boolean {
  if (f === "faltam") return !l.monitorado;
  if (f === "acoes-pendentes") return l.monitorado && l.acoes_abertas > 0;
  if (f === "concluidos") return l.monitorado && l.fase === "Concluído";
  if (f === "radar") return entrouNoRadarRecente(l);
  return true;
}
