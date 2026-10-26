import type { TipoLancamento } from "@/services/classificacao-itens";

export const ROTULO_TIPO: Record<TipoLancamento, string> = {
  aquisicao: "Aquisição",
  rendimento_aplicacao: "Rendimento da aplicação",
  acessorio_insumo: "Acessório ou insumo",
  multiplo: "Mais de um equipamento",
  nao_equipamento: "Não é equipamento",
};
