import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchHealthRegionCoverage,
  fetchMacroCoverage,
  fetchMunicipalityCoverage,
} from "../services/api";
import { useTerritorio } from "./use-territorio";

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
  const { territorio } = useTerritorio();
  const [ajusteTerritorial, setAjusteTerritorial] = useState<string | null>(
    null,
  );
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

  // Pre-seleciona uma macro assim que a lista carrega, se o usuario ainda
  // nao escolheu nenhuma. Prioriza o recorte territorial da Visao geral
  // (macro escolhida, ou a primeira macro da UF escolhida, explicando a
  // adaptacao); sem recorte, a primeira macro ordenada por UF/nome.
  useEffect(() => {
    if (selectedMacroId || macros.length === 0) return;
    const ordenadas = [...macros].sort(
      (a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome),
    );
    const daVisaoGeral = ordenadas.find((m) =>
      territorio.macros.includes(m.id),
    );
    if (daVisaoGeral) {
      setSelectedMacroId(daVisaoGeral.id);
      setAjusteTerritorial(
        territorio.macros.length > 1
          ? `O mapa mostra uma macrorregião por vez; abrimos ${daVisaoGeral.nome} (${daVisaoGeral.uf}), uma das selecionadas na Visão geral.`
          : null,
      );
      return;
    }
    const daUf = ordenadas.find((m) => territorio.ufs.includes(m.uf));
    if (daUf) {
      setSelectedMacroId(daUf.id);
      setAjusteTerritorial(
        `Recorte da Visão geral: ${territorio.ufs.join(", ")}. O mapa mostra uma macrorregião por vez; abrimos ${daUf.nome} (${daUf.uf}) — escolha outra no mapa se preferir.`,
      );
      return;
    }
    setSelectedMacroId(ordenadas[0].id);
    setAjusteTerritorial(
      territorio.regioesSaude.length ||
        territorio.municipios.length ||
        territorio.cnes.length
        ? "O recorte da Visão geral não tem macrorregião definida; abrimos a primeira da lista."
        : null,
    );
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
    setSelectedMacroId: (id: string | null) => {
      setAjusteTerritorial(null);
      setSelectedMacroId(id);
    },
    ajusteTerritorial,
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
