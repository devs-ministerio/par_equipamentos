import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchHealthRegionCoverage,
  fetchMacroCoverage,
  fetchMunicipalityCoverage,
} from "../services/api";

/**
 * Estado + fetch da navegação Macro -> Região de Saúde -> Município do Mapa
 * (`MapaPage`). Cobertura por macro depende só da família selecionada;
 * regiões de saúde e municípios dependem também da macro escolhida no mapa
 * -- cada `queryKey` inclui toda dependência que antes disparava o
 * `useEffect` de novo, então trocar de família ou de macro rapidamente já
 * cancela a resposta antiga em voo (TanStack Query cuida disso sozinho, sem
 * precisar da guarda manual `cancelado` que existia aqui antes).
 */
export function useMapaFiltros(familia: string) {
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [selectedMunicipioId, setSelectedMunicipioId] = useState<string | null>(
    null,
  );

  const coberturaQuery = useQuery({
    queryKey: ["macro-coverage", familia],
    queryFn: () => fetchMacroCoverage(familia),
  });
  const macros = coberturaQuery.data?.macros ?? [];
  const coberturaRows = coberturaQuery.data?.coberturaRows ?? [];

  // Pre-seleciona a primeira macro (ordenada por UF/nome) assim que a lista
  // carrega, se o usuario ainda nao escolheu nenhuma -- a secao "Recorte da
  // macrorregiao" sempre tem algo pra mostrar, em vez de comecar vazia
  // esperando um clique no mapa nacional (decisao 2026-08-23).
  useEffect(() => {
    if (selectedMacroId || macros.length === 0) return;
    const ordenadas = [...macros].sort(
      (a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome),
    );
    setSelectedMacroId(ordenadas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [macros]);

  const regioesSaudeQuery = useQuery({
    queryKey: ["health-region-coverage", familia, selectedMacroId],
    queryFn: () =>
      fetchHealthRegionCoverage({
        equipmentFamily: familia,
        macroCodes: [selectedMacroId as string],
      }),
    enabled: Boolean(selectedMacroId),
  });

  // Municipios da macro selecionada, SEM min_population (ao contrario da
  // tabela do Dashboard) -- aqui interessa poder escolher um municipio
  // pequeno, o caso que o criterio de raio de 75km existe pra cobrir.
  const municipiosMacroQuery = useQuery({
    queryKey: ["municipality-coverage", familia, selectedMacroId],
    queryFn: () =>
      fetchMunicipalityCoverage({
        equipmentFamily: familia,
        macroCodes: [selectedMacroId as string],
      }),
    enabled: Boolean(selectedMacroId),
  });
  const municipiosMacro = municipiosMacroQuery.data ?? [];

  // Reseta a selecao de municipio ao trocar de macro -- o municipio
  // escolhido pertence a outra macro, nao faz sentido manter.
  useEffect(() => {
    setSelectedMunicipioId(null);
  }, [selectedMacroId]);

  const municipioSelecionado = selectedMunicipioId
    ? municipiosMacro.find((m) => m.chave === selectedMunicipioId)
    : undefined;

  const macroSelecionada = selectedMacroId
    ? macros.find((m) => m.id === selectedMacroId)
    : undefined;
  const coberturaSelecionada = selectedMacroId
    ? coberturaRows.find((r) => r.macroId === selectedMacroId)
    : undefined;

  return {
    macros,
    coberturaRows,
    isLoading: coberturaQuery.isLoading,
    isError: coberturaQuery.isError,
    error: coberturaQuery.error as Error | null,

    selectedMacroId,
    setSelectedMacroId,
    macroSelecionada,
    coberturaSelecionada,

    regioesSaude: regioesSaudeQuery.data,
    regioesSaudeLoading: regioesSaudeQuery.isLoading,
    regioesSaudeError: regioesSaudeQuery.isError,

    municipiosMacro,
    municipiosMacroLoading: municipiosMacroQuery.isLoading,
    selectedMunicipioId,
    setSelectedMunicipioId,
    municipioSelecionado,
  };
}
