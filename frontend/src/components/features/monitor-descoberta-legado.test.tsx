import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonitorDescobertaLegado } from "./monitor-descoberta-legado";

afterEach(() => vi.unstubAllGlobals());
const coleta = {
  fonte: "siconv_descoberta",
  rotulo: "SICONV",
  status: "erro",
  ultima_tentativa_em: "2026-10-06T10:00:00Z",
  ultimo_sucesso_em: "2026-10-03T10:00:00Z",
  defasada: true,
  itens_verificados: 5,
  itens_alterados: 0,
  erro: "Últimos dados preservados.",
};
function apresentar(payload: unknown, status = 200) {
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/auth/me")
            ? {
                id: 1,
                name: "Teste",
                email: "qa@example.com",
                role: "admin",
                status: "active",
                created_at: "2026-10-06T10:00:00Z",
              }
            : payload,
        ),
        { status: url.endsWith("/auth/me") ? 200 : status },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MonitorDescobertaLegado fonte="siconv_descoberta" />
    </QueryClientProvider>,
  );
  return fetch;
}
describe("Monitor de descoberta", () => {
  it("não confunde verificação da carteira com descoberta sem captura", async () => {
    apresentar([{ ...coleta, fonte: "siconv_legado" }]);
    await waitFor(() =>
      expect(
        screen.getByText("Nenhuma coleta registrada."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Falhou/)).not.toBeInTheDocument();
  });
  it("exibe falha, defasagem e sucesso anterior sem inventar data", async () => {
    apresentar([coleta]);
    await waitFor(() =>
      expect(screen.getByText("Falhou · Defasada")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Detalhes da coleta"));
    expect(screen.getByText(/Último sucesso:/)).toBeInTheDocument();
    expect(screen.getByText("Últimos dados preservados.")).toBeInTheDocument();
  });
  it("atualiza apenas o histórico via GET e não dispara coleta", async () => {
    const fetch = apresentar([{ ...coleta, status: "ok", defasada: false }]);
    await waitFor(() =>
      expect(screen.getByText("Concluída")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar histórico de consultas" }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([url]) => url.endsWith("/fontes/capturas"))
          .length,
      ).toBe(2),
    );
    expect(
      fetch.mock.calls.every(
        ([url]) => url.endsWith("/auth/me") || url.endsWith("/fontes/capturas"),
      ),
    ).toBe(true);
  });
  it("apresenta erro seguro quando o histórico falha", async () => {
    apresentar([], 503);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(
      screen.getByRole("button", { name: "Atualizar histórico de consultas" }),
    ).toBeInTheDocument();
  });
});
