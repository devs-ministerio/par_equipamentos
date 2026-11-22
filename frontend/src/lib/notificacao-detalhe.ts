import type { Notificacao } from "@/services/notificacoes";

/** Atualização oficial com texto abre o popup de detalhes, em vez de ir direto ao registro. */
export function abreDetalhe(aviso: Notificacao): boolean {
  return aviso.tipo === "atualizacao_api" && !!aviso.corpo;
}
