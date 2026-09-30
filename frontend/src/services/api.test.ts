import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("serviço da Análise de Mérito", () => {
  it("consulta a cobertura pelo proxy relativo de produção com filtros repetidos", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api");
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchMacroCoverage } = await import("@/services/api");
    await expect(
      fetchMacroCoverage("TOMOGRAFO", ["1101", "1102"]),
    ).resolves.toEqual({ macros: [], coberturaRows: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/macro-coverage?equipment_family=TOMOGRAFO&macro_code=1101&macro_code=1102",
    );
  });

  it("preserva o endereço absoluto usado no desenvolvimento", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchMacroCoverage } = await import("@/services/api");
    await fetchMacroCoverage("RESSONANCIA");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:8000/macro-coverage?equipment_family=RESSONANCIA",
    );
  });
});
