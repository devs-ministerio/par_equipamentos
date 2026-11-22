/** Fases oficiais do acompanhamento, na ordem do fluxo (espelham `FaseAcompanhamento` do backend). */
export const FASES_ACOMPANHAMENTO = [
  "Acompanhamento iniciado",
  "Aguardando repasse",
  "Valor repassado",
  "Em aquisição",
  "Equipamento entregue",
  "Pós-entrega",
  "Concluído",
] as const;

export type FaseAcompanhamento = (typeof FASES_ACOMPANHAMENTO)[number];
