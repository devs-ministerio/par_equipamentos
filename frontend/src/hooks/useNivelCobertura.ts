import { useQuery } from "@tanstack/react-query";
import {
  fetchHealthRegionCoverage,
  fetchMunicipalityCoverage,
} from "@/services/api";
import type { NivelCoberturaRow } from "@/types/domain";

// Municipio abaixo disso nunca era esperado ter tomografo proprio (RN
// especifica de TOMOGRAFO -- ver Metodologia); so aplica no nivel municipio,
// e so quando o usuario nao pediu um municipio/CNES especifico (nesse caso
// ele quer ver aquele, do tamanho que for).
const POPULACAO_MINIMA_TOMOGRAFO = 100_000;

interface UseNivelCoberturaParams {
  equipmentFamily: string;
  nivel: "regiaoSaude" | "municipio";
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  /** true quando o usuario ja escolheu Municipio/CNES especifico -- desliga
   * o corte de populacao minima (ele quer ver aquele municipio do jeito que for). */
  semCorteDePopulacao?: boolean;
}

/**
 * Linhas da tabela "Cobertura Assistencial" no nível Região de Saúde ou
 * Município (NivelCoberturaTable). queryKey inclui toda dimensão de filtro
 * (nivel, states, macroCodes, healthRegionCodes, municipalities,
 * semCorteDePopulacao) -- antes a guarda contra corrida era manual
 * (`cancelado`): selecionar um CNES cascateia pro Município num segundo
 * instante (efeito separado em useFiltrosMacro), então um pedido SEM filtro
 * de município dispara primeiro (mais lento, ~5570 linhas) e um segundo
 * pedido JÁ filtrado (rápido, 1 linha) dispara logo em seguida -- sem essa
 * guarda, a resposta lenta e desfiltrada chegava depois e sobrescrevia o
 * resultado certo (bug reportado: CNES de Recife mostrando o país inteiro).
 * Com queryKey distinta por filtro, cada combinação é uma query própria e o
 * Query nunca deixa a mais antiga sobrescrever a mais nova.
 */
export function useNivelCobertura(params: UseNivelCoberturaParams) {
  const statesKey = params.states?.join(",") ?? "";
  const macrosKey = params.macroCodes?.join(",") ?? "";
  const regioesSaudeKey = params.healthRegionCodes?.join(",") ?? "";
  const municipiosKey = params.municipalities?.join(",") ?? "";

  const query = useQuery({
    queryKey: [
      "nivel-cobertura",
      params.equipmentFamily,
      params.nivel,
      statesKey,
      macrosKey,
      regioesSaudeKey,
      municipiosKey,
      params.semCorteDePopulacao ?? false,
    ],
    queryFn: (): Promise<NivelCoberturaRow[]> =>
      params.nivel === "municipio"
        ? fetchMunicipalityCoverage({
            equipmentFamily: params.equipmentFamily,
            states: params.states,
            macroCodes: params.macroCodes,
            healthRegionCodes: params.healthRegionCodes,
            municipalities: params.municipalities,
            minPopulation: params.semCorteDePopulacao
              ? undefined
              : POPULACAO_MINIMA_TOMOGRAFO,
          })
        : fetchHealthRegionCoverage({
            equipmentFamily: params.equipmentFamily,
            states: params.states,
            macroCodes: params.macroCodes,
          }),
  });

  return {
    rows: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
  };
}
