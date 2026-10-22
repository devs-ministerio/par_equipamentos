import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { atualizarCsrfToken, limparCsrfToken } from "@/lib/csrf";
import type { AcaoMonitoramento } from "@/services/monitoramento-acoes";
import type {
  EventoMarco,
  InstrumentoEquipamento,
} from "@/services/monitoramento-instrumentos";

export function criarAcaoTeste(
  extra: Partial<AcaoMonitoramento> = {},
): AcaoMonitoramento {
  return {
    id: 11,
    instrumento_id: 1,
    nr_convenio: "QA001",
    descricao: "Conferir documento sintético",
    data_prevista: null,
    data_conclusao: null,
    responsavel: null,
    created_at: "2026-10-19T10:00:00Z",
    ativo: true,
    ...extra,
  };
}

export function criarEventoTeste(
  extra: Partial<EventoMarco> = {},
): EventoMarco {
  return {
    id: 21,
    marco_id: 2,
    fase_geral_id: 1,
    data_ocorrencia: "2026-10-19",
    data_prevista: null,
    status_regulatorio: null,
    numero_documento: null,
    data_validade: null,
    observacao: null,
    created_at: "2026-10-19T10:00:00Z",
    ativo: true,
    ...extra,
  };
}

export function criarInstrumentoTeste(
  extra: Partial<InstrumentoEquipamento> = {},
): InstrumentoEquipamento {
  return {
    id: 1,
    nr_convenio: "QA001",
    cnpj_convenente: null,
    nome_convenente: "Unidade sintética",
    municipio: "Brasília",
    uf: "DF",
    cnes: null,
    equipamento_descricao: "Mamógrafo",
    equipamento_marca: null,
    equipamento_modelo: null,
    equipamento_numero_serie: null,
    equipamento_vida_util_anos: null,
    programa: null,
    tp_instrumento_programa: null,
    componente: null,
    ano_instrumento: null,
    tipo_contratacao: "Convênio",
    origem_dado: null,
    tipologia: null,
    investimento_aquisicao: null,
    situacao_programa: null,
    natureza_servico: null,
    tecnico_titular: null,
    tecnico_suplente: null,
    nivel_monitoramento: null,
    modalidade_onco: null,
    responsavel_execucao_nome: null,
    responsavel_execucao_contato: null,
    situacao_prestacao_contas: null,
    situacao_parceria_transferegov: null,
    situacao_ordem_pagamento_transferegov: null,
    pode_editar: true,
    ...extra,
  };
}

const clientes: QueryClient[] = [];
export function prepararMonitoramentoHttp() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  clientes.push(client);
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  atualizarCsrfToken("csrf-sintetico");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  return { client, fetch, wrapper, json };
}

export function limparMonitoramentoHttp() {
  for (const client of clientes.splice(0)) client.clear();
  limparCsrfToken();
  vi.unstubAllGlobals();
}
