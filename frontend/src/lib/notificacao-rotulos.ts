import type { NotificacaoTipo } from "@/services/notificacoes";

export const ROTULOS_NOTIFICACAO: Record<NotificacaoTipo, string> = {
  proposta_candidata: "Radar de propostas",
  atualizacao_api: "Atualização oficial",
  edicao_manual: "Edição da equipe",
  alerta_vigencia: "Fim de vigência",
  inclusao_monitoramento: "Novo monitoramento",
  aprovacao_carteira: "Entrada aprovada",
  convenio_descoberto: "Novo convênio no Radar",
  fonte_indisponivel: "Fonte indisponível",
  entrega_legada_revisao: "Entrega a vincular",
  prazo_acao: "Prazo de ação",
  prazo_inauguracao: "Previsão de inauguração",
};
