import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import {
  criarAcaoTeste,
  limparMonitoramentoHttp,
  prepararMonitoramentoHttp,
} from "@/test-fixtures/monitoramento-hooks";
import { monitoramentoKeys as keys } from "./monitoramento-query-keys";
import {
  useAcoesDoInstrumento,
  useConcluirAcao,
  useCriarAcao,
  useEditarAcao,
  useExcluirAcao,
  useMonitoramentoAcoes,
} from "./useMonitoramentoAcoes";

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});

describe("ações com hook, service e contrato HTTP reais", () => {
  it("compartilha a leitura geral sem misturar as ações de instrumentos distintos", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararMonitoramentoHttp();
    const a = criarAcaoTeste();
    const b = criarAcaoTeste({ id: 12, nr_convenio: "QA002" });
    fetch.mockResolvedValueOnce(json([a, b]));
    // Act
    const { result, rerender } = renderHook(
      ({ numero }) => ({
        todas: useMonitoramentoAcoes(),
        instrumento: useAcoesDoInstrumento(numero),
      }),
      { wrapper, initialProps: { numero: "QA001" } },
    );
    expect(result.current.instrumento.data).toBeUndefined();
    await waitFor(() => expect(result.current.todas.isSuccess).toBe(true));
    // Assert
    expect(result.current.todas.data).toEqual([a, b]);
    expect(result.current.instrumento.data).toEqual([a]);
    rerender({ numero: "QA002" });
    expect(result.current.instrumento.data).toEqual([b]);
    rerender({ numero: "QA003" });
    expect(result.current.instrumento.data).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("mantém as consultas todas e pendentes em caches distintos", async () => {
    // Arrange
    const { fetch, wrapper, json } = prepararMonitoramentoHttp();
    const concluida = criarAcaoTeste({ data_conclusao: "2026-10-19" });
    fetch.mockImplementation(async (url) =>
      json(String(url).includes("pendentes=true") ? [] : [concluida]),
    );
    // Act
    const { result } = renderHook(
      () => ({
        todas: useMonitoramentoAcoes(),
        pendentes: useMonitoramentoAcoes(true),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.pendentes.isSuccess).toBe(true));
    // Assert
    expect(result.current.todas.data).toEqual([concluida]);
    expect(result.current.pendentes.data).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([false, undefined])(
    "consulta sem pendentes quando a opção é %s",
    async (pendentes) => {
      // Arrange
      const { fetch, wrapper, json } = prepararMonitoramentoHttp();
      fetch.mockResolvedValueOnce(json([]));
      // Act
      const { result } = renderHook(() => useMonitoramentoAcoes(pendentes), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // Assert
      expect(result.current.data).toEqual([]);
      expect(new URL(String(fetch.mock.calls[0][0])).search).toBe("");
    },
  );

  it.each(["http", "schema"])(
    "expõe erro %s em vez de lista vazia saudável",
    async (falha) => {
      // Arrange
      const { fetch, wrapper, json } = prepararMonitoramentoHttp();
      fetch.mockResolvedValueOnce(
        falha === "http"
          ? json({ detail: "Fonte indisponível" }, 503)
          : json([{ id: "inválido" }]),
      );
      // Act
      const { result } = renderHook(() => useMonitoramentoAcoes(), { wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true));
      // Assert
      expect(result.current.error).toBeInstanceOf(ApiError);
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
    },
  );
});

type MutacaoTeste = {
  executar: () => Promise<unknown>;
  isSuccess: boolean;
  isError: boolean;
  isPending: boolean;
};
const corpo = {
  descricao: "Conferir entrega",
  responsavel_id: 7,
  data_prevista: "2026-11-01",
};
const casos: {
  nome: string;
  rota: string;
  metodo: string;
  corpo?: unknown;
  usar: () => MutacaoTeste;
}[] = [
  {
    nome: "criar",
    rota: "/monitoramento/instrumentos/QA001/acoes",
    metodo: "POST",
    corpo,
    usar: function useCriacaoTeste() {
      const m = useCriarAcao("QA001");
      return { ...m, executar: () => m.mutateAsync(corpo) };
    },
  },
  {
    nome: "concluir",
    rota: "/monitoramento/acoes/11/concluir",
    metodo: "PATCH",
    usar: function useConclusaoTeste() {
      const m = useConcluirAcao();
      return { ...m, executar: () => m.mutateAsync(11) };
    },
  },
  {
    nome: "corrigir",
    rota: "/monitoramento/acoes/11",
    metodo: "PATCH",
    corpo,
    usar: function useEdicaoTeste() {
      const m = useEditarAcao();
      return { ...m, executar: () => m.mutateAsync({ acaoId: 11, corpo }) };
    },
  },
  {
    nome: "excluir",
    rota: "/monitoramento/acoes/11",
    metodo: "DELETE",
    corpo: { motivo: "Registro duplicado" },
    usar: function useExclusaoTeste() {
      const m = useExcluirAcao();
      return {
        ...m,
        executar: () =>
          m.mutateAsync({ acaoId: 11, motivo: "Registro duplicado" }),
      };
    },
  },
];

describe.each(casos)("ação $nome", (caso) => {
  it("envia a operação exata e atualiza apenas ações/resumo após sucesso", async () => {
    // Arrange
    const { client, fetch, wrapper, json } = prepararMonitoramentoHttp();
    const invalidaveis = [
      keys.acoes(),
      keys.acoes(true),
      keys.acoes(false),
      keys.resumo,
    ];
    for (const key of [
      ...invalidaveis,
      keys.instrumento("QA002"),
      keys.instrumentos,
    ])
      client.setQueryData(key, []);
    let responder!: (value: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve;
        }),
    );
    const { result } = renderHook(caso.usar, { wrapper });
    // Act
    let pedido!: Promise<unknown>;
    act(() => {
      pedido = result.current.executar();
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(result.current.isPending).toBe(true);
    for (const key of invalidaveis)
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    const resposta = criarAcaoTeste({ id: 19 });
    await act(async () => {
      responder(json(resposta));
      expect(await pedido).toEqual(resposta);
    });
    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe(caso.rota);
    expect(init?.method).toBe(caso.metodo);
    expect(
      init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    ).toEqual(caso.corpo);
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
      "csrf-sintetico",
    );
    for (const key of invalidaveis)
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.instrumento("QA002"))?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(keys.instrumentos)?.isInvalidated).toBe(false);
  });

  it.each([403, 503])(
    "preserva o cache e expõe a falha HTTP %s",
    async (status) => {
      // Arrange
      const { client, fetch, wrapper, json } = prepararMonitoramentoHttp();
      client.setQueryData(keys.acoes(), [criarAcaoTeste()]);
      client.setQueryData(keys.resumo, { total_instrumentos: 1 });
      fetch.mockResolvedValueOnce(
        json({ detail: "Operação não concluída" }, status),
      );
      const { result } = renderHook(caso.usar, { wrapper });
      // Act
      await act(async () => {
        await expect(result.current.executar()).rejects.toMatchObject({
          status,
        });
      });
      // Assert
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isSuccess).toBe(false);
      expect(client.getQueryData(keys.acoes())).toEqual([criarAcaoTeste()]);
      expect(client.getQueryState(keys.acoes())?.isInvalidated).toBe(false);
      expect(client.getQueryState(keys.resumo)?.isInvalidated).toBe(false);
    },
  );
});
