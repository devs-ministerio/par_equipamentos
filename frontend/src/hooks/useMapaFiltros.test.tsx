import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  TERRITORIO_VAZIO,
  TerritorioContext,
  type Territorio,
} from "./use-territorio";
import { useMapaFiltros } from "./useMapaFiltros";

vi.mock("../services/api", () => ({
  fetchMacroCoverage: vi.fn().mockResolvedValue({
    macros: [
      { id: "1", nome: "Macro AC", uf: "AC" },
      { id: "2", nome: "Macro DF", uf: "DF" },
      { id: "3", nome: "Macro DF 2", uf: "DF" },
    ],
    coberturaRows: [],
  }),
  fetchHealthRegionCoverage: vi.fn().mockResolvedValue([]),
  fetchMunicipalityCoverage: vi.fn().mockResolvedValue([]),
}));

function montar(territorio: Territorio) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TerritorioContext.Provider
        value={{ territorio, setTerritorio: () => {} }}
      >
        {children}
      </TerritorioContext.Provider>
    </QueryClientProvider>
  );
  return renderHook(() => useMapaFiltros("PET_CT"), { wrapper });
}

describe("useMapaFiltros: recorte territorial da Visão geral", () => {
  it("sem recorte, abre a primeira macro da lista sem aviso", async () => {
    const { result } = montar(TERRITORIO_VAZIO);
    await waitFor(() => expect(result.current.selectedMacroId).toBe("1"));
    expect(result.current.ajusteTerritorial).toBeNull();
  });

  it("com UF escolhida, abre uma macro dessa UF e explica a adaptação", async () => {
    const { result } = montar({ ...TERRITORIO_VAZIO, ufs: ["DF"] });
    await waitFor(() => expect(result.current.selectedMacroId).toBe("2"));
    expect(result.current.ajusteTerritorial).toMatch(/DF/);
  });

  it("com uma macro escolhida, abre exatamente essa, sem aviso", async () => {
    const { result } = montar({ ...TERRITORIO_VAZIO, macros: ["3"] });
    await waitFor(() => expect(result.current.selectedMacroId).toBe("3"));
    expect(result.current.ajusteTerritorial).toBeNull();
  });
});
