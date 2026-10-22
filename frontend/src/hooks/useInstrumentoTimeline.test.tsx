import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import {
  criarEventoTeste,
  criarInstrumentoTeste,
  limparMonitoramentoHttp,
  prepararMonitoramentoHttp,
} from "@/test-fixtures/monitoramento-hooks";
import { monitoramentoKeys as keys } from "./monitoramento-query-keys";
import {
  useEditarEvento,
  useExcluirEvento,
  useInstrumentoTimeline,
  useRegistrarEvento,
  useSalvarCadastroInstrumento,
} from "./useInstrumentoTimeline";

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});

describe("timeline com transporte e contrato reais", () => {
  it("aguarda a consulta e isola o cache de cada instrumento", async () => {
    // Arrange
    const { wrapper, fetch, json } = prepararMonitoramentoHttp();
    let responder!: (value: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve;
        }),
    );
    const primeira = {
      instrumento: criarInstrumentoTeste(),
      eventos: [criarEventoTeste()],
      ao_vivo: { disponivel: false, valor_suspeito: false },
    };
    const segunda = {
      ...primeira,
      instrumento: criarInstrumentoTeste({ nr_convenio: "QA002" }),
      eventos: [],
    };
    const { result, rerender } = renderHook(
      ({ numero }) => useInstrumentoTimeline(numero),
      { wrapper, initialProps: { numero: "QA001" } },
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    // Act
    await act(async () => {
      responder(json(primeira));
    });
    await waitFor(() => expect(result.current.data).toEqual(primeira));
    fetch.mockResolvedValueOnce(json(segunda));
    rerender({ numero: "QA002" });
    // Assert
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(segunda));
    rerender({ numero: "QA001" });
    expect(result.current.data).toEqual(primeira);
    expect(
      fetch.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual([
      "/monitoramento/instrumentos/QA001",
      "/monitoramento/instrumentos/QA002",
    ]);
  });

  it("404 representa instrumento ainda não monitorado, não falha de rede", async () => {
    // Arrange
    const { wrapper, fetch, json } = prepararMonitoramentoHttp();
    fetch.mockResolvedValueOnce(json({ detail: "Não encontrado" }, 404));
    // Act
    const { result } = renderHook(() => useInstrumentoTimeline("QA001"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Assert
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it.each(["http", "schema"])(
    "não converte falha %s em ausência de monitoramento",
    async (falha) => {
      // Arrange
      const { wrapper, fetch, json } = prepararMonitoramentoHttp();
      fetch.mockResolvedValueOnce(
        falha === "http"
          ? json({ detail: "Indisponível" }, 503)
          : json({ instrumento: null }),
      );
      // Act
      const { result } = renderHook(() => useInstrumentoTimeline("QA001"), {
        wrapper,
      });
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
};
const cadastro = { tecnico_titular_id: 7, cnes: "0000001" };
const evento = { marco_id: 2, fase_geral_id: 1, data_ocorrencia: "2026-10-19" };
const correcao = { observacao: "Correção sintética", fase_geral_id: 1 };
const casos: {
  nome: string;
  rota: string;
  metodo: string;
  corpo: unknown;
  mudaResumo: boolean;
  usar: () => MutacaoTeste;
}[] = [
  {
    nome: "salvar cadastro",
    rota: "/monitoramento/instrumentos/QA001",
    metodo: "PATCH",
    corpo: cadastro,
    mudaResumo: false,
    usar: function useCadastroTeste() {
      const m = useSalvarCadastroInstrumento("QA001");
      return { ...m, executar: () => m.mutateAsync(cadastro) };
    },
  },
  {
    nome: "registrar evento",
    rota: "/monitoramento/instrumentos/QA001/eventos",
    metodo: "POST",
    corpo: evento,
    mudaResumo: true,
    usar: function useRegistroEventoTeste() {
      const m = useRegistrarEvento("QA001");
      return { ...m, executar: () => m.mutateAsync(evento) };
    },
  },
  {
    nome: "corrigir evento",
    rota: "/monitoramento/eventos/21",
    metodo: "PATCH",
    corpo: correcao,
    mudaResumo: true,
    usar: function useEdicaoEventoTeste() {
      const m = useEditarEvento("QA001");
      return {
        ...m,
        executar: () => m.mutateAsync({ eventoId: 21, corpo: correcao }),
      };
    },
  },
  {
    nome: "excluir evento",
    rota: "/monitoramento/eventos/21",
    metodo: "DELETE",
    corpo: { motivo: "Registro duplicado" },
    mudaResumo: true,
    usar: function useExclusaoEventoTeste() {
      const m = useExcluirEvento("QA001");
      return {
        ...m,
        executar: () =>
          m.mutateAsync({ eventoId: 21, motivo: "Registro duplicado" }),
      };
    },
  },
];

describe.each(casos)("$nome", (caso) => {
  it("atualiza a timeline certa e as listas dependentes após sucesso", async () => {
    // Arrange
    const { wrapper, client, fetch, json } = prepararMonitoramentoHttp();
    for (const key of [
      keys.instrumento("QA001"),
      keys.instrumento("QA002"),
      keys.instrumentos,
      keys.resumo,
      keys.acoes(),
    ])
      client.setQueryData(key, []);
    const resposta = caso.mudaResumo
      ? criarEventoTeste({ id: 29 })
      : criarInstrumentoTeste({ tecnico_titular_id: 7 });
    fetch.mockResolvedValueOnce(json(resposta));
    const { result } = renderHook(caso.usar, { wrapper });
    // Act
    await act(async () => {
      expect(await result.current.executar()).toEqual(resposta);
    });
    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe(caso.rota);
    expect(init?.method).toBe(caso.metodo);
    expect(JSON.parse(String(init?.body))).toEqual(caso.corpo);
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
      "csrf-sintetico",
    );
    expect(client.getQueryState(keys.instrumento("QA001"))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(keys.instrumentos)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.resumo)?.isInvalidated).toBe(
      caso.mudaResumo,
    );
    expect(client.getQueryState(keys.instrumento("QA002"))?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(keys.acoes())?.isInvalidated).toBe(false);
  });

  it.each(["http", "schema"])(
    "recusa resposta %s sem invalidar o cache",
    async (falha) => {
      // Arrange
      const { wrapper, client, fetch, json } = prepararMonitoramentoHttp();
      const chaves = [
        keys.instrumento("QA001"),
        keys.instrumentos,
        keys.resumo,
      ];
      for (const key of chaves) client.setQueryData(key, ["estado anterior"]);
      fetch.mockResolvedValueOnce(
        falha === "http"
          ? json({ detail: "Sem permissão" }, 403)
          : json({ id: "inválido" }),
      );
      const { result } = renderHook(caso.usar, { wrapper });
      // Act
      await act(async () => {
        await expect(result.current.executar()).rejects.toBeInstanceOf(
          ApiError,
        );
      });
      // Assert
      await waitFor(() => expect(result.current.isError).toBe(true));
      for (const key of chaves) {
        expect(client.getQueryState(key)?.isInvalidated).toBe(false);
        expect(client.getQueryData(key)).toEqual(["estado anterior"]);
      }
    },
  );
});
