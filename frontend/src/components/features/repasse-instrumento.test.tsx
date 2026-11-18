import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepasseInstrumento } from "./repasse-instrumento";

vi.mock("@/services/repasses", () => ({
  fetchSituacaoRepasse: vi.fn(),
  confirmarRepasse: vi.fn(),
}));

function renderizar(podeEditar = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <RepasseInstrumento
      numeroConvenio="953749"
      podeEditar={podeEditar}
      aoSessaoInvalida={() => undefined}
    />,
    { wrapper },
  );
}

describe("RepasseInstrumento", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { fetchSituacaoRepasse } = await import("@/services/repasses");
    vi.mocked(fetchSituacaoRepasse).mockResolvedValue({
      repasse: null,
      repasse_previsto: true,
      fase_calculada: "Aguardando repasse",
    });
  });

  it("mostra a fase calculada e pede a confirmação do repasse", async () => {
    renderizar();
    expect(await screen.findByText("Aguardando repasse")).toBeInTheDocument();
    expect(screen.getByText("Não confirmado")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar repasse" }),
    ).toBeInTheDocument();
  });

  it("não oferece confirmação a quem não pode editar", async () => {
    renderizar(false);
    await screen.findByText("Aguardando repasse");
    expect(
      screen.queryByRole("button", { name: "Confirmar repasse" }),
    ).not.toBeInTheDocument();
  });

  it("envia o tipo escolhido ao confirmar", async () => {
    const { confirmarRepasse } = await import("@/services/repasses");
    vi.mocked(confirmarRepasse).mockResolvedValue({
      id: 1,
      tipo: "parcial",
      origem: "manual",
      justificativa: null,
      autor_id: 3,
      criado_em: "2026-11-18T12:00:00Z",
    });
    renderizar();
    await userEvent.click(
      await screen.findByRole("button", { name: "Confirmar repasse" }),
    );
    await userEvent.click(screen.getByLabelText("Parcial"));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() =>
      expect(confirmarRepasse).toHaveBeenCalledWith("953749", {
        tipo: "parcial",
        justificativa: null,
      }),
    );
  });

  it("exige escolher integral ou parcial", async () => {
    renderizar();
    await userEvent.click(
      await screen.findByRole("button", { name: "Confirmar repasse" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "integral ou parcial",
    );
  });
});
