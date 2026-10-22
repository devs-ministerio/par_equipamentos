import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import { useDashboardTotais } from "./useDashboardTotais";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});
type Params = Parameters<typeof useDashboardTotais>[0];

describe("totais por recorte com hook e serviço reais", () => {
  it("envia todas as dimensões e distingue SUS em uso de total existente", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararConsultasCobertura();
    fetch.mockResolvedValueOnce(json({ existing_qty: 999, available_qty: 3 }));
    const params: Params = {
      equipmentFamily: "TOMOGRAFO",
      states: ["BA", "PE"],
      macroCodes: ["Q1", "Q2"],
      healthRegionCodes: ["RS1", "RS2"],
      municipalities: ["Cidade Um|BA", "Cidade Dois|PE"],
      cnesCodes: ["0000001", "0000002"],
    };
    // Act
    const { result } = renderHook(() => useDashboardTotais(params), {
      wrapper,
    });
    expect(result.current.totais).toBeNull();
    await waitFor(() => expect(result.current.totais).not.toBeNull());
    // Assert
    expect(result.current.totais).toEqual({
      existingQty: 999,
      availableQty: 3,
    });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/equipment-offer-rows/totals");
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
    expect(url.searchParams.getAll("cnes_code")).toEqual([
      "0000001",
      "0000002",
    ]);
  });

  const dimensoes: [string, Partial<Params>][] = [
    ["família", { equipmentFamily: "RESSONANCIA" }],
    ["UF", { states: ["SP"] }],
    ["macro", { macroCodes: ["Q2"] }],
    ["região de saúde", { healthRegionCodes: ["RS2"] }],
    ["município", { municipalities: ["Cidade Nova|BA"] }],
    ["CNES", { cnesCodes: ["0000002"] }],
  ];
  it.each(dimensoes)(
    "alterar %s não reutiliza o total de outro recorte",
    async (_, alteracao) => {
      // Arrange
      const { fetch, wrapper, json } = prepararConsultasCobertura();
      const params: Params = { equipmentFamily: "TOMOGRAFO" };
      fetch
        .mockResolvedValueOnce(json({ existing_qty: 999, available_qty: 99 }))
        .mockResolvedValueOnce(json({ existing_qty: 2, available_qty: 1 }));
      const { result, rerender } = renderHook(
        ({ params }) => useDashboardTotais(params),
        { wrapper, initialProps: { params } },
      );
      await waitFor(() => expect(result.current.totais?.availableQty).toBe(99));
      // Act
      rerender({ params: { ...params, ...alteracao } });
      // Assert
      expect(result.current.totais).toBeNull();
      await waitFor(() =>
        expect(result.current.totais).toEqual({
          existingQty: 2,
          availableQty: 1,
        }),
      );
      rerender({ params });
      expect(result.current.totais).toEqual({
        existingQty: 999,
        availableQty: 99,
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["http", "schema"])(
    "falha %s mantém total indisponível em vez de zero inventado",
    async (falha) => {
      // Arrange
      const { client, fetch, wrapper, json } = prepararConsultasCobertura();
      fetch.mockResolvedValueOnce(json({}, falha === "http" ? 503 : 200));
      // Act
      const { result } = renderHook(
        () => useDashboardTotais({ equipmentFamily: "TOMOGRAFO" }),
        { wrapper },
      );
      await waitFor(() =>
        expect(client.getQueryCache().findAll()[0]?.state.status).toBe("error"),
      );
      // Assert
      expect(result.current.totais).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("preserva zero real e não sobrescreve o recorte atual com resposta antiga atrasada", async () => {
    // Arrange
    const { client, fetch, wrapper, json } = prepararConsultasCobertura();
    let responder!: (r: Response) => void;
    fetch
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            responder = resolve;
          }),
      )
      .mockResolvedValueOnce(json({ existing_qty: 0, available_qty: 0 }));
    const params: Params = { equipmentFamily: "TOMOGRAFO" };
    const { result, rerender } = renderHook(
      ({ params }) => useDashboardTotais(params),
      { wrapper, initialProps: { params } },
    );
    // Act
    rerender({ params: { ...params, cnesCodes: ["0000001"] } });
    await waitFor(() =>
      expect(result.current.totais).toEqual({
        existingQty: 0,
        availableQty: 0,
      }),
    );
    await act(async () => {
      responder(json({ existing_qty: 999, available_qty: 99 }));
    });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    // Assert
    expect(result.current.totais).toEqual({ existingQty: 0, availableQty: 0 });
  });
});
