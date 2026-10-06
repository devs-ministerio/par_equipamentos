import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidatosLegados } from "./candidatos-legados";
import { fetchCandidatosLegados } from "@/services/candidatos-legados";
import { ApiError } from "@/lib/api-error";

afterEach(() => vi.unstubAllGlobals());

const candidato = {
  id: 1,
  numero: "123456",
  id_proposta: "10",
  confirmacao_portal: "nao_encontrado",
  data_publicacao: null,
  origem: "snapshot_local",
  descoberto_em: "2026-10-06T10:00:00Z",
  verificado_em: "2026-10-06T10:00:00Z",
  evidencias: [
    {
      id_item: "1",
      codigo: "acelerador_linear",
      nome: "Acelerador Linear",
      descricao: "LINAC sintético",
      relacao: "existente",
    },
  ],
};

function prepararApi(payload: unknown, status = 200) {
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/auth/me")
            ? {
                id: 1,
                name: "Demonstração",
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CandidatosLegados />
    </QueryClientProvider>,
  );
  return fetch;
}

describe("Radar legado", () => {
  it("filtra confirmação no servidor e permite limpar sem mudar o estado oficial", async () => {
    const fetch = prepararApi({
      total: 1,
      itens: [{ ...candidato, origem: "siconv_oficial" }],
    });
    await waitFor(() =>
      expect(screen.getByText("Captura do SICONV")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Confirmação no Portal/ }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "Publicação confirmada no Portal" }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          url.includes("confirmacao=confirmado"),
        ),
      ).toBe(true),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Publicação confirmada/ }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "Todas as confirmações" }),
    );
    expect(screen.getByText("Não encontrado no Portal")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Confirmação no Portal/ }),
    ).toBeInTheDocument();
  });

  it("separa candidato não confirmado de carteira e explica equipamento existente", async () => {
    prepararApi({ total: 1, itens: [candidato] });
    await waitFor(() =>
      expect(screen.getByText("Convênio 123456")).toBeInTheDocument(),
    );
    expect(screen.getByText("Não encontrado no Portal")).toBeInTheDocument();
    expect(screen.getByText(/Equipamento existente/)).toBeInTheDocument();
    expect(screen.getByText(/frescor não confirmado/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Incluir/ }),
    ).not.toBeInTheDocument();
  });

  it("envia busca e página ao servidor, sem filtrar lista parcial na UI", async () => {
    const fetch = prepararApi({ total: 11, itens: [candidato] });
    await waitFor(() =>
      expect(screen.getByText("Convênio 123456")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("pagina=2"))).toBe(
        true,
      ),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Buscar candidato legado" }),
      { target: { value: "123456" } },
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) => url.includes("pagina=1") && url.includes("busca=123456"),
        ),
      ).toBe(true),
    );
  });

  it("não declara descoberta ativa quando a lista está vazia", async () => {
    prepararApi({ total: 0, itens: [] });
    await waitFor(() =>
      expect(
        screen.getByText(/não confirma que a descoberta automática/),
      ).toBeInTheDocument(),
    );
  });

  it("exibe erro e tentativa novamente", async () => {
    prepararApi({}, 503);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
  });

  it("contrato inválido não é interpretado como candidato confirmado", async () => {
    prepararApi({
      total: 1,
      itens: [{ ...candidato, confirmacao_portal: "inventado" }],
    });
    await expect(
      fetchCandidatosLegados(1, "", undefined),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
