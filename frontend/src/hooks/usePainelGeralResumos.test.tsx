import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  criarMacroResposta,
  criarNivelResposta,
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import {
  type EstadoResumo,
  usePainelGeralResumos,
} from "./usePainelGeralResumos";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});

function exigirResumo(estado: EstadoResumo) {
  expect(typeof estado).toBe("object");
  if (typeof estado === "string") throw new Error("Resumo não carregado");
  return estado;
}

function criarFontesPainel() {
  const ufs = ["BA", "BA", "PE", "SP", "SP", "PE", "BA", "SP"];
  const percentuais = [55, 5, 30, 20, 10, 40];
  return {
    "/macro-coverage": [
      ...percentuais.map((p, i) =>
        criarMacroResposta(i, "deficient", p, ufs[i]),
      ),
      criarMacroResposta(6, "not_deficient", 180, ufs[6]),
      criarMacroResposta(7, "not_available", null, ufs[7]),
    ],
    "/equipment-offer-rows/totals": { available_qty: 3, existing_qty: 999 },
    "/municipality-coverage": [
      criarNivelResposta("M1"),
      criarNivelResposta("M2", "not_deficient"),
      criarNivelResposta("M3", "not_available"),
    ],
    "/health-region-coverage": [
      criarNivelResposta("RS1"),
      criarNivelResposta("RS2", "not_deficient"),
    ],
    "/equipment-offer-rows/by-legal-nature": [
      { legal_nature: "Público", available_qty: 3, existing_qty: 999 },
    ],
  };
}

describe("resumos por família com services e Zod reais", () => {
  it("não consulta nenhuma fonte sem família selecionada", () => {
    // Arrange / Act
    const { fetch, wrapper } = prepararConsultasCobertura();
    const { result } = renderHook(() => usePainelGeralResumos([]), { wrapper });
    // Assert
    expect(result.current).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it("só publica o resumo após as cinco fontes e mantém SUS separado do total", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararConsultasCobertura();
    const fontes = criarFontesPainel();
    let responder!: (r: Response) => void;
    fetch.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/equipment-offer-rows/by-legal-nature")
        return new Promise<Response>((resolve) => {
          responder = resolve;
        });
      return json(fontes[path as keyof typeof fontes]);
    });
    const { result } = renderHook(() => usePainelGeralResumos(["TOMOGRAFO"]), {
      wrapper,
    });
    expect(result.current.TOMOGRAFO).toBe("carregando");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(5));
    // Act
    await act(async () => {
      responder(json(fontes["/equipment-offer-rows/by-legal-nature"]));
    });
    await waitFor(() => expect(typeof result.current.TOMOGRAFO).toBe("object"));
    // Assert: classificação vem do status da fonte; não é recalculada pelo teste.
    const resumo = exigirResumo(result.current.TOMOGRAFO);
    expect(resumo).toMatchObject({
      familia: "TOMOGRAFO",
      totalSus: 3,
      totalGeral: 999,
      macrosHipo: 6,
      macrosTotal: 8,
      municipiosHipo: 1,
      municipiosTotal: 3,
      regioesHipo: 1,
      regioesTotal: 2,
      naturezaJuridica: [
        { naturezaJuridica: "Público", availableQty: 3, existingQty: 999 },
      ],
    });
    expect(resumo.top5Hipo.map((m) => m.macroId)).toEqual([
      "Q1",
      "Q4",
      "Q3",
      "Q2",
      "Q5",
    ]);
    expect(resumo.top5Hiper.map((m) => m.macroId)).toEqual([
      "Q6",
      "Q0",
      "Q5",
      "Q2",
      "Q3",
    ]);
    expect(resumo.top5Hipo[0]).toEqual({
      macroId: "Q1",
      nome: "Macro sintética 1",
      uf: "BA",
      cobertura: 5,
    });
    expect(resumo.coberturaRows.map((r) => r.macroId)).toEqual([
      "Q0",
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "Q5",
      "Q6",
      "Q7",
    ]);
    expect(resumo.coberturaRows[7].status).toBe("Dados indisponíveis");
    expect(resumo.porRegiao).toEqual([
      { regiao: "Norte", total: 0, hipo: 0 },
      { regiao: "Nordeste", total: 5, hipo: 4 },
      { regiao: "Centro-Oeste", total: 0, hipo: 0 },
      { regiao: "Sudeste", total: 3, hipo: 2 },
      { regiao: "Sul", total: 0, hipo: 0 },
    ]);
    const urls = fetch.mock.calls.map(([url]) => new URL(String(url)));
    expect(
      urls.every((u) => u.searchParams.get("equipment_family") === "TOMOGRAFO"),
    ).toBe(true);
    expect(
      urls
        .find((u) => u.pathname === "/municipality-coverage")
        ?.searchParams.get("min_population"),
    ).toBe("100000");
    expect(
      fetch.mock.calls.every(([, init]) => init?.credentials === "include"),
    ).toBe(true);
  });

  const fontes = Object.keys(criarFontesPainel());
  const falhas = fontes.flatMap((path) =>
    ["http", "schema"].map((tipo) => ({ path, tipo })),
  );
  it.each(falhas)(
    "falha $tipo em $path não vira resumo saudável com zeros",
    async ({ path, tipo }) => {
      // Arrange
      const { fetch, wrapper, json } = prepararConsultasCobertura();
      const dados = criarFontesPainel();
      fetch.mockImplementation(async (input) => {
        const atual = new URL(String(input)).pathname;
        return atual === path
          ? json({}, tipo === "http" ? 503 : 200)
          : json(dados[atual as keyof typeof dados]);
      });
      // Act
      const { result } = renderHook(
        () => usePainelGeralResumos(["TOMOGRAFO"]),
        { wrapper },
      );
      await waitFor(() => expect(result.current.TOMOGRAFO).toBe("erro"));
      // Assert
      expect(fetch).toHaveBeenCalledTimes(5);
    },
  );

  it("uma família com erro não impede outra e remover família preserva seu cache", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararConsultasCobertura();
    const dados = criarFontesPainel();
    fetch.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("equipment_family") === "RESSONANCIA")
        return json({}, 503);
      return json(dados[url.pathname as keyof typeof dados]);
    });
    const { result, rerender } = renderHook(
      ({ familias }) => usePainelGeralResumos(familias),
      { wrapper, initialProps: { familias: ["RESSONANCIA", "TOMOGRAFO"] } },
    );
    // Act
    await waitFor(() => expect(result.current.RESSONANCIA).toBe("erro"));
    await waitFor(() => expect(typeof result.current.TOMOGRAFO).toBe("object"));
    const anterior = result.current.TOMOGRAFO;
    rerender({ familias: ["TOMOGRAFO"] });
    // Assert
    expect(Object.keys(result.current)).toEqual(["TOMOGRAFO"]);
    expect(result.current.TOMOGRAFO).toEqual(anterior);
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it("resposta vazia íntegra mantém zero real e rankings vazios", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararConsultasCobertura();
    fetch.mockImplementation(async (input) =>
      json(
        new URL(String(input)).pathname.endsWith("/totals")
          ? { available_qty: 0, existing_qty: 0 }
          : [],
      ),
    );
    // Act
    const { result } = renderHook(() => usePainelGeralResumos(["TOMOGRAFO"]), {
      wrapper,
    });
    await waitFor(() => expect(typeof result.current.TOMOGRAFO).toBe("object"));
    // Assert
    expect(exigirResumo(result.current.TOMOGRAFO)).toMatchObject({
      totalSus: 0,
      totalGeral: 0,
      macrosHipo: 0,
      macrosTotal: 0,
      municipiosHipo: 0,
      municipiosTotal: 0,
      regioesHipo: 0,
      regioesTotal: 0,
      top5Hipo: [],
      top5Hiper: [],
      naturezaJuridica: [],
    });
  });
});
