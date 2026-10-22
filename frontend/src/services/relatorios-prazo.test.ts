import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { limparCsrfToken } from "@/lib/csrf";
import { gerarRelatorio } from "./relatorios";

const gerar = (signal?: AbortSignal) =>
  gerarRelatorio(
    "docx",
    "instrumentos_repasse",
    "completo",
    { escopo: "brasil" },
    signal,
  );
const arquivo = () =>
  new Response("arquivo sintético", {
    headers: { "content-disposition": 'attachment; filename="carteira.docx"' },
  });

beforeEach(() => {
  vi.useFakeTimers();
  limparCsrfToken();
  vi.stubGlobal("document", { cookie: "sigeo_csrf=csrf-sintetico" });
  vi.stubGlobal("window", {
    location: { pathname: "/relatorios", assign: vi.fn() },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  limparCsrfToken();
});

it("aguarda exportação acima de 15 segundos sem segunda geração", async () => {
  // Given
  const fetchHttp = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(arquivo()), 20_000),
      ),
  );
  vi.stubGlobal("fetch", fetchHttp);
  // When
  const pedido = gerar();
  await vi.advanceTimersByTimeAsync(20_000);
  // Then
  expect((await pedido).nomeArquivo).toBe("carteira.docx");
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("limita a 90 segundos e ignora resposta tardia sem retry", async () => {
  // Given
  let resolver!: (resposta: Response) => void;
  const fetchHttp = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        resolver = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchHttp);
  // When
  const pedido = gerar();
  const verificacao = expect(pedido).rejects.toMatchObject({
    name: "ApiError",
    publicMessage: expect.stringContaining("90 segundos"),
  });
  await vi.advanceTimersByTimeAsync(90_000);
  await verificacao;
  resolver(arquivo());
  await vi.advanceTimersByTimeAsync(90_000);
  // Then
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(fetchHttp.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("prazo inclui corpo que fica pendurado após os cabeçalhos", async () => {
  // Given
  let corpo!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      corpo = controller;
    },
  });
  const fetchHttp = vi.fn().mockResolvedValue(new Response(stream));
  vi.stubGlobal("fetch", fetchHttp);
  // When
  const verificacao = expect(gerar()).rejects.toMatchObject({
    publicMessage: expect.stringContaining("90 segundos"),
  });
  await vi.advanceTimersByTimeAsync(90_000);
  // Then
  await verificacao;
  corpo.error(new Error("falha tardia de rede"));
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("falha ao ler corpo vira ApiError sem expor diagnóstico de rede", async () => {
  // Given
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new Error("diagnóstico privado"));
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
  // When / Then
  await expect(gerar()).rejects.toMatchObject({
    name: "ApiError",
    publicMessage:
      "Não foi possível completar a operação. Tente novamente em instantes.",
  });
  expect(vi.getTimerCount()).toBe(0);
});

it.each([403, 422, 500])(
  "mantém status %s sem vazar detalhe de 5xx",
  async (status) => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: "mensagem sintética" }, { status }),
        ),
    );
    // When / Then
    await expect(gerar()).rejects.toMatchObject({
      status,
      publicMessage:
        status < 500
          ? "mensagem sintética"
          : "Não foi possível completar a operação. Tente novamente em instantes.",
    });
  },
);

it("503 informa indisponibilidade com mensagem local sem ler corpo nem repetir", async () => {
  // Given
  const resposta = Response.json(
    { error: "SQL e diagnóstico privado" },
    { status: 503 },
  );
  const lerCorpo = vi.spyOn(resposta, "text");
  const fetchHttp = vi.fn().mockResolvedValue(resposta);
  vi.stubGlobal("fetch", fetchHttp);
  // When / Then
  await expect(gerar()).rejects.toMatchObject({
    status: 503,
    publicMessage:
      "O servidor está ocupado ou temporariamente indisponível. Aguarde e tente gerar o relatório novamente.",
  });
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(lerCorpo).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancelamento encerra I/O sem renovar ou repetir", async () => {
  // Given
  const controller = new AbortController();
  const fetchHttp = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchHttp);
  // When
  const verificacao = expect(gerar(controller.signal)).rejects.toMatchObject({
    publicMessage: "Geração do relatório cancelada.",
  });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  // Then
  await verificacao;
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("401 renova uma vez e recebe arquivo sem alterar cookies/CSRF", async () => {
  // Given
  const fetchHttp = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ csrf_token: "novo" }))
    .mockResolvedValueOnce(arquivo());
  vi.stubGlobal("fetch", fetchHttp);
  // When
  const obtido = await gerar();
  // Then
  expect(obtido.nomeArquivo).toBe("carteira.docx");
  expect(fetchHttp).toHaveBeenCalledTimes(3);
  expect(fetchHttp.mock.calls[1][0]).toContain("/auth/refresh");
  expect(fetchHttp.mock.calls[1][1]).toMatchObject({
    credentials: "include",
    method: "POST",
    headers: { "X-CSRF-Token": "csrf-sintetico" },
  });
});

it("timeout durante refresh encerra exportação e não inicia geração tardia", async () => {
  // Given
  let resolver!: (resposta: Response) => void;
  const fetchHttp = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolver = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetchHttp);
  // When
  const verificacao = expect(gerar()).rejects.toBeInstanceOf(ApiError);
  await vi.advanceTimersByTimeAsync(90_000);
  await verificacao;
  resolver(Response.json({ csrf_token: "novo" }));
  await vi.advanceTimersByTimeAsync(1);
  // Then
  expect(fetchHttp).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("401 definitivo não gera arquivo nem faz loop de refresh", async () => {
  // Given
  const fetchHttp = vi
    .fn()
    .mockResolvedValue(Response.json({}, { status: 401 }));
  vi.stubGlobal("fetch", fetchHttp);
  // When / Then
  await expect(gerar()).rejects.toMatchObject({ status: 401 });
  expect(fetchHttp).toHaveBeenCalledTimes(2);
  expect(window.location.assign).toHaveBeenCalledWith("/login");
});
