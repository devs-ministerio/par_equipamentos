import type { MarcoCatalogo } from "@/services/monitoramento-marcos";

export function criarMarcosInteracao(): MarcoCatalogo[] {
  return [
    {
      id: 1,
      codigo: "fase_contratado",
      grupo: "fase_geral",
      ordem: 1,
      execucao_fisica_pct_referencia: 0.5,
      rotulo: "Contratado",
      descricao_referencia: null,
    },
    {
      id: 2,
      codigo: "cronograma_previsao_inauguracao",
      grupo: "cronograma_fisico",
      ordem: null,
      execucao_fisica_pct_referencia: null,
      rotulo: "Previsão de inauguração",
      descricao_referencia: null,
    },
    {
      id: 3,
      codigo: "regulatorio_licenca_operacao",
      grupo: "regulatorio",
      ordem: null,
      execucao_fisica_pct_referencia: null,
      rotulo: "Licença de operação",
      descricao_referencia: null,
    },
    {
      id: 4,
      codigo: "fase_concluido",
      grupo: "fase_geral",
      ordem: 2,
      execucao_fisica_pct_referencia: 1,
      rotulo: "Concluído",
      descricao_referencia: null,
    },
  ];
}
