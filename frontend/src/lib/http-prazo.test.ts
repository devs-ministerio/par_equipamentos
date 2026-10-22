import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  executarHttpComPrazo,
  HttpCanceladoError,
  HttpTimeoutError,
} from "./http-prazo";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("interrompe I/O pendurado mesmo com sinal externo que não foi cancelado", async () => {
  // Given
  const externo = new AbortController();
  let sinal!: AbortSignal;
  // When
  const pedido = executarHttpComPrazo(
    (signal) => {
      sinal = signal;
      return new Promise<Response>(() => {});
    },
    15_000,
    externo.signal,
  );
  const verificacao = expect(pedido).rejects.toBeInstanceOf(HttpTimeoutError);
  await vi.advanceTimersByTimeAsync(15_000);
  // Then
  await verificacao;
  expect(sinal.aborted).toBe(true);
  expect(externo.signal.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancelamento externo encerra a espera sem aguardar o prazo", async () => {
  // Given
  const externo = new AbortController();
  const pedido = executarHttpComPrazo(
    () => new Promise<Response>(() => {}),
    15_000,
    externo.signal,
  );
  const verificacao = expect(pedido).rejects.toBeInstanceOf(HttpCanceladoError);
  // When
  await vi.advanceTimersByTimeAsync(1);
  externo.abort();
  // Then
  await verificacao;
  expect(vi.getTimerCount()).toBe(0);
});

it("sinal previamente cancelado não inicia I/O", async () => {
  // Given
  const externo = new AbortController();
  externo.abort();
  const operacao = vi.fn(async () => "não iniciar");
  // When / Then
  await expect(
    executarHttpComPrazo(operacao, 15_000, externo.signal),
  ).rejects.toBeInstanceOf(HttpCanceladoError);
  expect(operacao).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([0, -1, NaN, Infinity])(
  "rejeita prazo inválido %s sem iniciar I/O",
  async (prazo) => {
    // Given
    const operacao = vi.fn(async () => "não iniciar");
    // When / Then
    await expect(executarHttpComPrazo(operacao, prazo)).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(operacao).not.toHaveBeenCalled();
  },
);

it("sucesso limpa prazo e listener sem abortar sinal já concluído", async () => {
  // Given
  const externo = new AbortController();
  let sinal!: AbortSignal;
  // When
  const obtido = await executarHttpComPrazo(
    async (signal) => {
      sinal = signal;
      return "arquivo recebido";
    },
    15_000,
    externo.signal,
  );
  externo.abort();
  await vi.advanceTimersByTimeAsync(30_000);
  // Then
  expect(obtido).toBe("arquivo recebido");
  expect(sinal.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it("erro síncrono da fronteira preserva erro e libera timer", async () => {
  // Given
  const falha = new TypeError("I/O sintético falhou");
  // When / Then
  await expect(
    executarHttpComPrazo(() => {
      throw falha;
    }, 15_000),
  ).rejects.toBe(falha);
  expect(vi.getTimerCount()).toBe(0);
});

it("sem a opção, nenhum listener sobra no sinal do chamador depois do sucesso", async () => {
  // Given
  const externo = new AbortController();
  let sinal!: AbortSignal;
  // When
  await executarHttpComPrazo(
    async (signal) => {
      sinal = signal;
      return "ok";
    },
    15_000,
    externo.signal,
  );
  externo.abort();
  // Then: o abort do chamador não alcança o sinal de uma operação já concluída
  expect(sinal.aborted).toBe(false);
});

it("com a opção, o abort do chamador depois da resposta cancela o sinal já entregue (corpo em leitura)", async () => {
  // Given
  const externo = new AbortController();
  let sinal!: AbortSignal;
  // When: a resposta chega, o corpo seguiria em leitura
  await executarHttpComPrazo(
    async (signal) => {
      sinal = signal;
      return "cabecalhos";
    },
    15_000,
    externo.signal,
    { propagarAbortAposResposta: true },
  );
  expect(sinal.aborted).toBe(false);
  externo.abort();
  // Then
  expect(sinal.aborted).toBe(true);
});
