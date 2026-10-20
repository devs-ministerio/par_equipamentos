import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import {
  prepararHooksRadar,
  limparHooksRadar,
  fonteSintetica,
} from "@/test-fixtures/radar-hooks";
import { useCandidatosLegados } from "./use-candidatos-legados";
import { useHistoricoLegado } from "./useTriagemLegado";
import { useFontes } from "./use-fontes";
import { usePropostasCandidatas } from "./use-propostas-candidatas";
import { monitoramentoKeys } from "./monitoramento-query-keys";

afterEach(limparHooksRadar);

describe("consultas do Radar e fontes — transporte e Zod reais", () => {
  it("envia página, busca e situação e mantém novos como contagem global", async () => {
    // Arrange
    const api = prepararHooksRadar();
    const { result, rerender } = renderHook(
      ({ pagina, busca }) =>
        useCandidatosLegados(true, pagina, busca, "em_analise"),
      {
        wrapper: api.wrapper,
        initialProps: { pagina: 2, busca: "999001" },
      },
    );
    // Act
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = new URL(String(api.chamadas("/candidatos-legados?")[0][0]));
    // Assert
    expect(Object.fromEntries(url.searchParams)).toEqual({
      pagina: "2",
      tamanho_pagina: "10",
      busca: "999001",
      situacao: "em_analise",
    });
    expect(result.current.data?.novos).toBe(1);
    rerender({ pagina: 3, busca: "outra busca" });
    await waitFor(() =>
      expect(api.chamadas("busca=outra+busca")).toHaveLength(1),
    );
  });

  it.each(["janela fechada", "visitante"])(
    "não consulta candidatos para %s",
    async (caso) => {
      const api = prepararHooksRadar();
      if (caso === "visitante") api.controle.usuario = null;
      const { result } = renderHook(
        () => useCandidatosLegados(caso !== "janela fechada", 1, ""),
        { wrapper: api.wrapper },
      );
      await waitFor(() =>
        expect(
          api.client.getQueryState(monitoramentoKeys.currentUser)?.status,
        ).toBe("success"),
      );
      expect(result.current.fetchStatus).toBe("idle");
      expect(api.chamadas("/candidatos-legados")).toHaveLength(0);
    },
  );

  it.each(["indisponível", "schema inválido"])(
    "não transforma resposta %s em lista vazia",
    async (caso) => {
      const api = prepararHooksRadar();
      api.controle.interceptar = (url) =>
        url.pathname.endsWith("/candidatos-legados")
          ? caso === "indisponível"
            ? api.json({ detail: "Fonte indisponível" }, 503)
            : api.json({ total: 1 })
          : undefined;
      const { result } = renderHook(() => useCandidatosLegados(true, 1, ""), {
        wrapper: api.wrapper,
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(ApiError);
      expect(result.current.data).toBeUndefined();
      expect(api.chamadas("/candidatos-legados?")).toHaveLength(2);
    },
  );

  it("aceita recorte realmente vazio sem parâmetros opcionais", async () => {
    const api = prepararHooksRadar();
    api.controle.pagina = { total: 0, novos: 0, itens: [] };
    const { result } = renderHook(() => useCandidatosLegados(true, 1, ""), {
      wrapper: api.wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ total: 0, novos: 0, itens: [] });
    expect(String(api.chamadas("/candidatos-legados?")[0][0])).not.toMatch(
      /busca=|situacao=/,
    );
  });

  it("troca a fila ao mudar a identidade autenticada, sem reaproveitar o cache anterior", async () => {
    // Arrange
    const api = prepararHooksRadar();
    const { result } = renderHook(() => useCandidatosLegados(true, 1, ""), {
      wrapper: api.wrapper,
    });
    await waitFor(() =>
      expect(result.current.data?.itens[0].numero).toBe("999001"),
    );
    // Act: alteração de sessão observada pelo próprio useAuthSession.
    api.controle.usuario = { ...api.controle.usuario!, id: 2 };
    api.controle.candidato = { ...api.controle.candidato, numero: "999002" };
    await act(async () => {
      await api.client.invalidateQueries({
        queryKey: monitoramentoKeys.currentUser,
      });
    });
    // Assert: dados antigos não são apresentados como dados do novo usuário.
    await waitFor(() =>
      expect(result.current.data?.itens[0].numero).toBe("999002"),
    );
    expect(
      api.client.getQueryData(["candidatos-legados", 1, 1, "", undefined]),
    ).toMatchObject({ itens: [{ numero: "999001" }] });
    expect(api.chamadas("/candidatos-legados?")).toHaveLength(2);
  });

  it("pagina o histórico por candidato e só consulta ao abrir", async () => {
    const api = prepararHooksRadar();
    const { result, rerender } = renderHook(
      ({ aberta }) => useHistoricoLegado(7, aberta, 2),
      { wrapper: api.wrapper, initialProps: { aberta: false } },
    );
    await waitFor(() =>
      expect(
        api.client.getQueryState(monitoramentoKeys.currentUser)?.status,
      ).toBe("success"),
    );
    expect(api.chamadas("/historico")).toHaveLength(0);
    rerender({ aberta: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(api.chamadas("/historico")[0][0])).toContain(
      "/7/historico?pagina=2&tamanho_pagina=10",
    );
    expect(result.current.data).toEqual({ total: 0, itens: [] });
  });

  it("preserva erro, parcial e frescor recebido no monitor das fontes", async () => {
    const api = prepararHooksRadar();
    const { result } = renderHook(useFontes, { wrapper: api.wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([fonteSintetica]);
    expect(result.current.data?.[0].status).toBe("parcial");
    expect(result.current.data?.[0].defasada).toBe(true);
  });

  it("não consulta fontes sem sessão", async () => {
    const api = prepararHooksRadar();
    api.controle.usuario = null;
    const { result } = renderHook(useFontes, { wrapper: api.wrapper });
    await waitFor(() =>
      expect(
        api.client.getQueryState(monitoramentoKeys.currentUser)?.status,
      ).toBe("success"),
    );
    expect(api.chamadas("/fontes/capturas")).toHaveLength(0);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("expõe erro de contrato das fontes em vez de afirmar que estão atualizadas", async () => {
    const api = prepararHooksRadar();
    api.controle.fontes = [{ ...fonteSintetica, status: "inventado" }];
    const { result } = renderHook(useFontes, { wrapper: api.wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.data).toBeUndefined();
  });

  it("consulta propostas em tramitação e encerra loading sem inventar itens", async () => {
    const api = prepararHooksRadar();
    const { result } = renderHook(usePropostasCandidatas, {
      wrapper: api.wrapper,
    });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.propostas).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.erro).toBeNull();
    expect(String(api.chamadas("/propostas-candidatas")[0][0])).toContain(
      "pagina=1&tamanho_pagina=500",
    );
    await act(async () => {
      await api.client.invalidateQueries({
        queryKey: monitoramentoKeys.propostasCandidatas(),
      });
    });
    expect(api.chamadas("/propostas-candidatas")).toHaveLength(2);
  });

  it("mantém falha de propostas distinta de sucesso sem propostas", async () => {
    const api = prepararHooksRadar();
    api.controle.interceptar = (url) =>
      url.pathname.endsWith("/propostas-candidatas")
        ? api.json({ total: 1 })
        : undefined;
    const { result } = renderHook(usePropostasCandidatas, {
      wrapper: api.wrapper,
    });
    await waitFor(() => expect(result.current.erro).toBeInstanceOf(ApiError));
    expect(result.current.carregando).toBe(false);
    expect(result.current.propostas).toEqual([]);
    expect(result.current.total).toBe(0);
  });
});
