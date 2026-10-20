import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";
import {
  criarInstrumentoTeste,
  prepararMonitoramentoHttp,
} from "./monitoramento-hooks";
import { criarDetalheConvenioResposta } from "./convenios-detalhe";

export const ROTAS_MESA = [
  "/monitoramento/instrumentos",
  "/monitoramento/resumo",
  "/convenios",
] as const;

export function prepararMesa() {
  const h = prepararMonitoramentoHttp();
  const instrumentos = [
    criarInstrumentoTeste({
      id: 1,
      nr_convenio: "QA001",
      nome_convenente: "Unidade Alfa sintética",
      municipio: "Anápolis",
      uf: "GO",
      fase_atual: "Concluído",
      tecnico_titular: "Técnico sintético",
      situacao_prestacao_contas: "Prestação de Contas Concluída",
      equipamento_descricao: "Texto composto que não é marcador",
    }),
    criarInstrumentoTeste({
      id: 2,
      nr_convenio: "QA002",
      nome_convenente: "Unidade Beta sintética",
      municipio: "Cidade Beta",
      uf: "BA",
      fase_atual: "Não iniciado",
      tecnico_titular: null,
    }),
  ];
  const resumo: ResumoMonitoramento = {
    total_instrumentos: 2,
    pct_execucao_fisica_medio: 0.6,
    distribuicao_fase: [],
    licencas_cnen_deferidas: 1,
    licencas_vencendo: [],
    por_tecnico_titular: [],
    inauguracoes: [],
    acoes_pendentes: 0,
    acoes_atrasadas: 0,
    nr_convenios: ["QA001", "QA002"],
    divergencias_conclusao: [],
    divergencias_conclusao_por_fonte: [],
    indicadores_por_instrumento: instrumentos.map((item, i) => ({
      nr_convenio: item.nr_convenio,
      acoes_pendentes: 0,
      acoes_atrasadas: 0,
      licenca_cnen_deferida: !i,
      pct_referencia_fase: i ? 0.2 : 1,
      ultima_atividade_em: null,
    })),
    acoes_em_aberto: [],
    fila_acoes_truncada: false,
    gerado_em: "2026-10-20T10:00:00Z",
  };
  const marcadores = [
    {
      codigo: "mamo",
      nome: "Mamógrafo",
      prioritario: true,
      descricao_original: "Mamógrafo",
      tipo_evidencia: "item_plano",
      relacao: "aquisicao",
      confianca: 1,
    },
    {
      codigo: "cadeira",
      nome: "0123 - Cadeira hospitalar",
      prioritario: false,
      descricao_original: "Cadeira hospitalar",
      tipo_evidencia: "item_plano",
      relacao: "aquisicao",
      confianca: 1,
    },
  ];
  const convenios = instrumentos.map((item, i) =>
    criarDetalheConvenioResposta({
      numero: item.nr_convenio,
      equipamentos: i ? [] : marcadores,
    }),
  );
  const respostas = new Map<
    string,
    { body: unknown; status: number; pendente?: Promise<Response> }
  >([
    [ROTAS_MESA[0], { body: instrumentos, status: 200 }],
    [ROTAS_MESA[1], { body: resumo, status: 200 }],
    [
      ROTAS_MESA[2],
      { body: { total: convenios.length, itens: convenios }, status: 200 },
    ],
  ]);
  h.fetch.mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const resposta = respostas.get(path);
    if (!resposta) throw new Error(`Rota sintética não prevista: ${path}`);
    return resposta.pendente ?? h.json(resposta.body, resposta.status);
  });
  return { ...h, instrumentos, resumo, respostas };
}
