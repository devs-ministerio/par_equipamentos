import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import {
  criarNivelResposta,
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import { useHealthRegionByMacro } from "./useHealthRegionByMacro";
import { useMunicipalityByHealthRegion } from "./useMunicipalityByHealthRegion";
import { useNivelCobertura } from "./useNivelCobertura";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});
type Params = Parameters<typeof useNivelCobertura>[0];

describe("tabela de cobertura por nível com transporte real", () => {
  it("serializa o recorte completo e preserva os indicadores da fonte", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararConsultasCobertura();
    fetch.mockResolvedValueOnce(json([criarNivelResposta()]));
    const params: Params = {
      equipmentFamily: "TOMOGRAFO",
      nivel: "municipio",
      states: ["BA", "PE"],
      macroCodes: ["Q1", "Q2"],
      healthRegionCodes: ["RS1", "RS2"],
      municipalities: ["Cidade Um|BA", "Cidade Dois|PE"],
    };
    // Act
    const { result } = renderHook(() => useNivelCobertura(params), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    // Assert
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/municipality-coverage");
    expect(url.searchParams.getAll("state")).toEqual(["BA", "PE"]);
    expect(url.searchParams.getAll("macro_code")).toEqual(["Q1", "Q2"]);
    expect(url.searchParams.getAll("health_region_code")).toEqual([
      "RS1",
      "RS2",
    ]);
    expect(url.searchParams.getAll("municipality")).toEqual([
      "Cidade Um|BA",
      "Cidade Dois|PE",
    ]);
    expect(url.searchParams.get("min_population")).toBe("100000");
    expect(result.current.rows[0]).toMatchObject({
      chave: "Q1",
      oferta: 1,
      ofertaTotal: 99,
      cobertura: 25,
      status: "Hipossuficiente",
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it.each([true, false, undefined])(
    "corte do tomógrafo com semCorteDePopulacao=%s",
    async (semCorteDePopulacao) => {
      // Arrange
      const { fetch, wrapper, json } = prepararConsultasCobertura();
      fetch.mockResolvedValueOnce(json([]));
      // Act
      const { result } = renderHook(
        () =>
          useNivelCobertura({
            equipmentFamily: "TOMOGRAFO",
            nivel: "municipio",
            semCorteDePopulacao,
          }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      // Assert
      expect(result.current.rows).toEqual([]);
      expect(
        new URL(String(fetch.mock.calls[0][0])).searchParams.get(
          "min_population",
        ),
      ).toBe(semCorteDePopulacao ? null : "100000");
    },
  );

  it("região de saúde consulta a rota agregada sem corte populacional", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararConsultasCobertura();
    fetch.mockResolvedValueOnce(
      json([criarNivelResposta("RS1", "not_available")]),
    );
    // Act
    const { result } = renderHook(
      () =>
        useNivelCobertura({
          equipmentFamily: "TOMOGRAFO",
          nivel: "regiaoSaude",
          states: ["BA"],
          macroCodes: ["Q1"],
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    // Assert
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/health-region-coverage");
    expect(url.searchParams.get("state")).toBe("BA");
    expect(url.searchParams.get("macro_code")).toBe("Q1");
    expect(url.searchParams.has("min_population")).toBe(false);
    expect(result.current.rows[0].status).toBe("Dados indisponíveis");
  });

  const mudancas: [string, Partial<Params>][] = [
    ["família", { equipmentFamily: "RESSONANCIA" }],
    ["nível", { nivel: "regiaoSaude" }],
    ["UF", { states: ["SP"] }],
    ["macro", { macroCodes: ["Q2"] }],
    ["região de saúde", { healthRegionCodes: ["RS2"] }],
    ["município", { municipalities: ["Cidade Nova|BA"] }],
    ["corte", { semCorteDePopulacao: true }],
  ];
  it.each(mudancas)(
    "trocar %s não reaproveita o resultado de outro recorte",
    async (_, alteracao) => {
      // Arrange
      const { fetch, wrapper, json } = prepararConsultasCobertura();
      const params: Params = {
        equipmentFamily: "TOMOGRAFO",
        nivel: "municipio",
      };
      fetch
        .mockResolvedValueOnce(json([criarNivelResposta("ANTIGO")]))
        .mockResolvedValueOnce(json([criarNivelResposta("NOVO")]));
      const { result, rerender } = renderHook(
        ({ params }) => useNivelCobertura(params),
        { wrapper, initialProps: { params } },
      );
      await waitFor(() => expect(result.current.rows[0]?.chave).toBe("ANTIGO"));
      // Act
      rerender({ params: { ...params, ...alteracao } });
      // Assert
      expect(result.current.loading).toBe(true);
      expect(result.current.rows).toEqual([]);
      await waitFor(() => expect(result.current.rows[0]?.chave).toBe("NOVO"));
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("a consulta nacional lenta não sobrescreve o município selecionado depois", async () => {
    // Arrange
    const { fetch, client, wrapper, json } = prepararConsultasCobertura();
    let responderAntiga!: (r: Response) => void;
    fetch
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            responderAntiga = resolve;
          }),
      )
      .mockResolvedValueOnce(json([criarNivelResposta("RECORTE-NOVO")]));
    const params: Params = { equipmentFamily: "TOMOGRAFO", nivel: "municipio" };
    const { result, rerender } = renderHook(
      ({ params }) => useNivelCobertura(params),
      { wrapper, initialProps: { params } },
    );
    // Act
    rerender({
      params: {
        ...params,
        municipalities: ["Cidade Nova|BA"],
        semCorteDePopulacao: true,
      },
    });
    await waitFor(() =>
      expect(result.current.rows[0]?.chave).toBe("RECORTE-NOVO"),
    );
    await act(async () => {
      responderAntiga(json([criarNivelResposta("NACIONAL-ANTIGO")]));
    });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Assert
    expect(result.current.rows.map((r) => r.chave)).toEqual(["RECORTE-NOVO"]);
  });

  it.each(["http", "schema"])(
    "falha %s termina loading e não vira sucesso vazio",
    async (falha) => {
      // Arrange
      const { fetch, wrapper, json } = prepararConsultasCobertura();
      fetch.mockResolvedValueOnce(json({}, falha === "http" ? 503 : 200));
      // Act
      const { result } = renderHook(
        () =>
          useNivelCobertura({
            equipmentFamily: "TOMOGRAFO",
            nivel: "municipio",
          }),
        { wrapper },
      );
      await waitFor(() =>
        expect(result.current.error).toBeInstanceOf(ApiError),
      );
      // Assert
      expect(result.current.loading).toBe(false);
      expect(result.current.rows).toEqual([]);
    },
  );
});

const expansoes = [
  {
    nome: "regiões da macro",
    useConsulta: useHealthRegionByMacro,
    path: "/health-region-coverage",
    parametro: "macro_code",
  },
  {
    nome: "municípios da região de saúde",
    useConsulta: useMunicipalityByHealthRegion,
    path: "/municipality-coverage",
    parametro: "health_region_code",
  },
];

describe.each(expansoes)("expansão de $nome", (caso) => {
  it("busca somente ao expandir e mantém família/território no pedido e cache", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararConsultasCobertura();
    let responder!: (r: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ enabled, familia, id }) => caso.useConsulta(familia, id, enabled),
      {
        wrapper,
        initialProps: { enabled: false, familia: "TOMOGRAFO", id: "QA1" },
      },
    );
    expect(result.current.dados).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    // Act
    rerender({ enabled: true, familia: "TOMOGRAFO", id: "QA1" });
    expect(result.current.dados).toBe("carregando");
    await act(async () => {
      responder(json([criarNivelResposta("PRIMEIRO")]));
    });
    await waitFor(() => expect(typeof result.current.dados).not.toBe("string"));
    // Assert
    expect(result.current.dados).toEqual([
      expect.objectContaining({
        chave: "PRIMEIRO",
        oferta: 1,
        ofertaTotal: 99,
      }),
    ]);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe(caso.path);
    expect(url.searchParams.get(caso.parametro)).toBe("QA1");
    expect(url.searchParams.get("equipment_family")).toBe("TOMOGRAFO");
    expect(url.searchParams.has("min_population")).toBe(false);
    fetch.mockResolvedValueOnce(json([]));
    rerender({ enabled: true, familia: "TOMOGRAFO", id: "QA2" });
    await waitFor(() => expect(result.current.dados).toEqual([]));
    fetch.mockResolvedValueOnce(json([criarNivelResposta("OUTRA-FAMILIA")]));
    rerender({ enabled: true, familia: "RESSONANCIA", id: "QA1" });
    await waitFor(() =>
      expect(result.current.dados).toEqual([
        expect.objectContaining({ chave: "OUTRA-FAMILIA" }),
      ]),
    );
    rerender({ enabled: true, familia: "TOMOGRAFO", id: "QA1" });
    expect(result.current.dados).toEqual([
      expect.objectContaining({ chave: "PRIMEIRO" }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["http", "schema"])(
    "falha %s é erro explícito e permite nova consulta",
    async (falha) => {
      // Arrange
      const { fetch, client, wrapper, json } = prepararConsultasCobertura();
      fetch.mockResolvedValueOnce(json({}, falha === "http" ? 503 : 200));
      const { result } = renderHook(
        () => caso.useConsulta("TOMOGRAFO", "QA1", true),
        { wrapper },
      );
      // Act / Assert
      await waitFor(() => expect(result.current.dados).toBe("erro"));
      fetch.mockResolvedValueOnce(json([]));
      await act(async () => {
        await client.invalidateQueries();
      });
      await waitFor(() => expect(result.current.dados).toEqual([]));
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
});
