import type { NotificacaoTipo } from "@/services/notificacoes";

export const ROTULOS_NOTIFICACAO: Record<NotificacaoTipo, string> = {
  proposta_candidata: "Radar de propostas",
  atualizacao_api: "Atualização oficial",
  edicao_manual: "Edição da equipe",
  alerta_vigencia: "Fim de vigência",
  inclusao_monitoramento: "Novo monitoramento",
  fonte_indisponivel: "Fonte indisponível",
};
