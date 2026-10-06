import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SituacaoFontes } from "./situacao-fontes";
import { fetchCapturasFontes } from "@/services/fontes";
import { ApiError } from "@/lib/api-error";

afterEach(() => vi.unstubAllGlobals());

function apiFontes(payload: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/auth/me") ? {
      id: 1, name: "Demonstração", email: "qa@example.com", role: "admin", status: "active", created_at: "2026-10-06T10:00:00Z",
    } : payload,
  ), { status: url.endsWith("/auth/me") ? 200 : status })));
}

function apresentar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SituacaoFontes /></QueryClientProvider>);
}

describe("frescor das fontes oficiais", () => {
  it("não apresenta uma caixa vazia como dados atualizados", async () => {
    apiFontes([]);
    apresentar();
    await waitFor(() => expect(screen.getByText(/Nenhuma coleta registrada/)).toBeInTheDocument());
  });

  it("preserva o sucesso anterior e mostra falha e defasagem separadamente", async () => {
    apiFontes([{
      fonte: "siconv_legado", rotulo: "SICONV", status: "erro",
      ultima_tentativa_em: "2026-10-06T10:00:00Z", ultimo_sucesso_em: "2026-10-03T10:00:00Z",
      defasada: true, itens_verificados: 5, itens_alterados: 0,
      erro: "Os últimos dados confirmados foram preservados.",
    }]);
    apresentar();
    await waitFor(() => expect(screen.getByText("Falha na coleta")).toBeInTheDocument());
    expect(screen.getByText(/Dados defasados/)).toBeInTheDocument();
    expect(screen.getByText(/5 verificados/)).toBeInTheDocument();
    expect(screen.getByText("Última coleta concluída")).toBeInTheDocument();
  });

  it("rejeita payload incompatível em vez de assumir fonte saudável", async () => {
    apiFontes([{ status: "ok" }]);
    await expect(fetchCapturasFontes()).rejects.toBeInstanceOf(ApiError);
  });

  it("mostra erro e tentativa novamente quando a API falha", async () => {
    apiFontes([], 503);
    apresentar();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
