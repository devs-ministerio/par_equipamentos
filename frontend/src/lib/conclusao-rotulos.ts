import type { ResultadoConclusao } from "@/services/conclusao-acompanhamento";

export const ROTULO_RESULTADO: Record<ResultadoConclusao, string> = {
  integral: "Integral",
  parcial: "Parcial",
  sem_entregas: "Sem entregas",
};
