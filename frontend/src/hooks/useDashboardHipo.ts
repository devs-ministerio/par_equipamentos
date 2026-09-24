import { useQuery } from "@tanstack/react-query";
import {
  fetchHealthRegionCoverage,
  fetchMunicipalityCoverage,
} from "@/services/api";

interface UseDashboardHipoParams {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
}

// RN especifica de TOMOGRAFO (ver Metodologia): municipio abaixo disso nunca
// foi esperado ter equipamento proprio -- so vale pro card de Municipios
// Hipossuficientes, independente de o usuario ja ter escolhido um
// municipio/CNES especifico (esse card sempre usa o mesmo corte).
const POPULACAO_MINIMA_TOMOGRAFO = 100_000;

/**
 * Contagens dos cards clicaveis "Municípios Hipossuficientes" e "Regiões de
 * Saúde Hipossuficientes" -- mesmo recorte geografico dos outros cards do
 * Dashboard. Duas queries independentes (uma nao depende do resultado da
 * outra, entao nao usam `enabled` em cascata entre si).
 *
 * queryKey inclui toda dimensao de filtro que dispara o fetch de novo --
 * antes disso a guarda contra corrida era manual (variavel `cancelado`):
 * selecionar um CNES cascateia pro Municipio num segundo instante (efeito
 * separado em useFiltrosMacro), entao um pedido SEM filtro de municipio
 * dispara primeiro (mais lento, lista nacional) e um pedido JA filtrado
 * dispara logo depois (mais rapido) -- sem guarda, a resposta lenta e
 * desfiltrada chegava por ultimo e sobrescrevia o card com o numero
 * nacional errado. Com queryKey distinta por filtro, essas viram duas
 * queries diferentes e o Query nunca deixa a mais antiga sobrescrever a mais
 * nova.
 */
export function useDashboardHipo(params: UseDashboardHipoParams) {
  const statesKey = params.states?.join(",") ?? "";
  const macrosKey = params.macroCodes?.join(",") ?? "";
  const regioesSaudeKey = params.healthRegionCodes?.join(",") ?? "";
  const municipiosKey = params.municipalities?.join(",") ?? "";

  const municipiosQuery = useQuery({
    queryKey: [
      "municipios-hipo",
      params.equipmentFamily,
      statesKey,
      macrosKey,
      regioesSaudeKey,
      municipiosKey,
    ],
    queryFn: async () => {
      const rows = await fetchMunicipalityCoverage({
        equipmentFamily: params.equipmentFamily,
        states: params.states,
        macroCodes: params.macroCodes,
        healthRegionCodes: params.healthRegionCodes,
        municipalities: params.municipalities,
        minPopulation: POPULACAO_MINIMA_TOMOGRAFO,
      });
      return rows.filter((r) => r.status === "Hipossuficiente").length;
    },
  });

  const regioesSaudeQuery = useQuery({
    queryKey: [
      "regioes-saude-hipo",
      params.equipmentFamily,
      statesKey,
      macrosKey,
    ],
    queryFn: async () => {
      const rows = await fetchHealthRegionCoverage({
        equipmentFamily: params.equipmentFamily,
        states: params.states,
        macroCodes: params.macroCodes,
      });
      return {
        hipo: rows.filter((r) => r.status === "Hipossuficiente").length,
        total: rows.length,
      };
    },
  });

  return {
    municipiosHipo: municipiosQuery.data ?? null,
    regioesSaudeHipo: regioesSaudeQuery.data?.hipo ?? null,
    regioesSaudeTotal: regioesSaudeQuery.data?.total ?? null,
  };
}
