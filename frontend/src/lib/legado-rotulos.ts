import type { SituacaoLegado } from "@/services/candidatos-legados";

export const ROTULOS_SITUACAO: Record<SituacaoLegado, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};
export const CLASSES_SITUACAO: Record<SituacaoLegado, string> = {
  novo: "border-primary/25 bg-primary/10 text-primary",
  em_analise: "border-warning/25 bg-warning/10 text-warning",
  aprovado: "border-success/25 bg-success/10 text-success",
  rejeitado: "border-border bg-muted/40 text-muted-foreground",
};
