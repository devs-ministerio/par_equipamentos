import type { ConfirmacaoLegado } from "@/services/candidatos-legados";

export const ROTULOS_CONFIRMACAO: Record<ConfirmacaoLegado, string> = {
  nao_consultado: "Portal ainda não consultado",
  nao_encontrado: "Não encontrado no Portal",
  sem_publicacao: "Publicação não confirmada",
  confirmado: "Publicação confirmada no Portal",
};

export const ROTULOS_RELACAO = {
  aquisicao: "Aquisição",
  modernizacao: "Modernização",
  existente: "Equipamento existente",
  mencao: "Menção textual",
} as const;
