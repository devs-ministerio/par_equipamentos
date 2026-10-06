import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { useNotificacoes } from "./use-notificacoes";

afterEach(() => vi.unstubAllGlobals());

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function simularApi(falha = false) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/auth/me"))
      return new Response(
        JSON.stringify({
          id: 1,
          name: "Pessoa sintética",
          email: "qa@example.com",
          role: "admin",
          status: "active",
          created_at: "2026-10-06T10:00:00Z",
        }),
      );
    if (url.endsWith("/auth/csrf"))
      return new Response(JSON.stringify({ csrf_token: "qa" }));
    if (falha) return new Response("", { status: 503 });
    return new Response(
      JSON.stringify(
        init?.method === "PATCH"
          ? { alteradas: 2 }
          : { itens: [], total: 0, nao_lidas: 2 },
      ),
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("caixa de notificações", () => {
  it("envia filtros, preserva contagem global e executa leitura em lote", async () => {
    const fetch = simularApi();
    const { result } = renderHook(
      () => useNotificacoes({ busca: "825374", arquivadas: true, offset: 10 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.naoLidas).toBe(2));
    expect(
      fetch.mock.calls.some(
        ([url]) =>
          url.includes("busca=825374") &&
          url.includes("arquivadas=true") &&
          url.includes("offset=10"),
      ),
    ).toBe(true);
    await act(async () => {
      await result.current.marcarTodas();
    });
    expect(
      fetch.mock.calls.some(
        ([url, init]) =>
          url.endsWith("/notificacoes/lidas") && init?.method === "PATCH",
      ),
    ).toBe(true);
  });

  it("expõe falha normalizada em vez de apresentar sucesso vazio", async () => {
    simularApi(true);
    const { result } = renderHook(() => useNotificacoes(), { wrapper });
    await waitFor(() => expect(result.current.erro).toBeInstanceOf(ApiError), {
      timeout: 3000,
    });
    expect(result.current.carregando).toBe(false);
  });
});
