import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";

type StatusApi = "deficient" | "not_deficient" | "not_available";

export function criarMacroResposta(
  indice = 1,
  status: StatusApi = "deficient",
  cobertura: number | null = 25,
  uf = "BA",
) {
  return {
    id: indice + 1,
    execution_id: 1,
    macro_code: `Q${indice}`,
    macro_name: `Macro sintética ${indice}`,
    state: uf,
    equipment_family: "TOMOGRAFO",
    population: 100_000,
    population_residente: 120_000,
    population_ans: 20_000,
    estimated_need: 2,
    required_qty: 2,
    available_qty: 1,
    existing_qty: 99,
    facility_count: 1,
    balance: -1,
    deficit_status: status,
    coverage_percentage: cobertura,
  };
}

export function criarNivelResposta(
  chave = "Q1",
  status: StatusApi = "deficient",
) {
  return {
    ibge_code: chave,
    municipality_name: `Cidade sintética ${chave}`,
    health_region_code: chave,
    health_region_name: `Região sintética ${chave}`,
    macro_code: "Q1",
    macro_name: "Macro sintética 1",
    state: "BA",
    population: 100_000,
    population_residente: 120_000,
    population_ans: 20_000,
    available_qty: 1,
    existing_qty: 99,
    coverage_percentage: 25,
    deficit_status: status,
    distance_km_nearest_equipment: null,
    latitude: null,
    longitude: null,
    ibge_code_7: null,
  };
}

const clientes: QueryClient[] = [];
export function prepararConsultasCobertura() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  clientes.push(client);
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  return { fetch, client, wrapper, json };
}

export function limparConsultasCobertura() {
  for (const client of clientes.splice(0)) client.clear();
  vi.unstubAllGlobals();
}
