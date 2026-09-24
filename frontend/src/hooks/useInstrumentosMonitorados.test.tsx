import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { useMonitoramentoInstrumentos } from "./useInstrumentosMonitorados";

vi.mock("@/services/monitoramento-instrumentos", () => ({
  fetchInstrumentos: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useMonitoramentoInstrumentos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("entrega os instrumentos carregados", async () => {
    const { fetchInstrumentos } =
      await import("@/services/monitoramento-instrumentos");
    vi.mocked(fetchInstrumentos).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useMonitoramentoInstrumentos(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("propaga erro do service para a página decidir a recuperação", async () => {
    const { fetchInstrumentos } =
      await import("@/services/monitoramento-instrumentos");
    vi.mocked(fetchInstrumentos).mockRejectedValueOnce(
      new ApiError("Sem conexão", 503),
    );
    const { result } = renderHook(() => useMonitoramentoInstrumentos(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
  });
});
