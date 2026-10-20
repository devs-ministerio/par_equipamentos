import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useGerarRelatorio } from "./use-gerar-relatorio";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:http://localhost/qa");
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.spyOn(toast, "success");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("duplo clique inicia só uma exportação enquanto mantém loading", async () => {
  // Given
  let responder!: (resposta: Response) => void;
  const resposta = new Promise<Response>((resolve) => {
    responder = resolve;
  });
  const fetchHttp = vi.fn().mockReturnValue(resposta);
  vi.stubGlobal("fetch", fetchHttp);
  const { result } = renderHook(() =>
    useGerarRelatorio("instrumentos_repasse"),
  );
  let pedido!: Promise<void>;
  // When
  act(() => {
    pedido = result.current.gerar("docx", "completo", { escopo: "brasil" });
    void result.current.gerar("xlsx", "completo", { escopo: "brasil" });
  });
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  // Then
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(result.current.gerando).toBe("docx");
  await act(async () => {
    responder(new Response("arquivo QA"));
    await pedido;
  });
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect(result.current).toMatchObject({ gerando: null, erro: null });
});

it("timeout encerra loading sem download e libera nova tentativa manual", async () => {
  // Given
  const fetchHttp = vi
    .fn()
    .mockImplementationOnce(() => new Promise<Response>(() => {}))
    .mockResolvedValueOnce(new Response("arquivo QA"));
  vi.stubGlobal("fetch", fetchHttp);
  const { result } = renderHook(() =>
    useGerarRelatorio("instrumentos_repasse"),
  );
  let pedido!: Promise<void>;
  // When
  act(() => {
    pedido = result.current.gerar("docx", "completo", { escopo: "brasil" });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90_000);
    await pedido;
  });
  // Then
  expect(result.current.gerando).toBeNull();
  expect(result.current.erro?.publicMessage).toContain("90 segundos");
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  await act(() =>
    result.current.gerar("xlsx", "simplificado", { escopo: "uf", uf: "BA" }),
  );
  expect(fetchHttp).toHaveBeenCalledTimes(2);
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect(result.current).toMatchObject({ gerando: null, erro: null });
});

it("sair da página cancela HTTP e resposta tardia não baixa arquivo", async () => {
  // Given
  let responder!: (resposta: Response) => void;
  const fetchHttp = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        responder = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchHttp);
  const { result, unmount } = renderHook(() =>
    useGerarRelatorio("instrumentos_repasse"),
  );
  let pedido!: Promise<void>;
  // When
  act(() => {
    pedido = result.current.gerar("docx", "completo", { escopo: "brasil" });
  });
  await act(() => vi.advanceTimersByTimeAsync(1));
  unmount();
  await pedido;
  responder(new Response("resposta QA tardia"));
  await vi.advanceTimersByTimeAsync(100_000);
  // Then
  expect(fetchHttp.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});

it("servidor ocupado encerra loading sem download e permite tentar manualmente", async () => {
  // Given: HTTP real do service, só transporte é substituído.
  const fetchHttp = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "diagnóstico privado" }, { status: 503 }),
    )
    .mockResolvedValueOnce(new Response("arquivo QA"));
  vi.stubGlobal("fetch", fetchHttp);
  const { result } = renderHook(() =>
    useGerarRelatorio("instrumentos_repasse"),
  );
  // When
  await act(() =>
    result.current.gerar("docx", "completo", { escopo: "brasil" }),
  );
  // Then
  expect(result.current.gerando).toBeNull();
  expect(result.current.erro?.publicMessage).toBe(
    "O servidor está ocupado ou temporariamente indisponível. Aguarde e tente gerar o relatório novamente.",
  );
  expect(fetchHttp).toHaveBeenCalledTimes(1);
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  await act(() =>
    result.current.gerar("docx", "completo", { escopo: "brasil" }),
  );
  expect(fetchHttp).toHaveBeenCalledTimes(2);
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect(result.current).toMatchObject({ gerando: null, erro: null });
});
