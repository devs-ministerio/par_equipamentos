import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monitoramentoKeys } from "@/hooks/monitoramento-query-keys";
import { AdicionarMonitoramentoButton } from "./adicionar-monitoramento-button";

vi.mock("@/hooks/useAuthSession", () => ({ useAuthSession: vi.fn() }));
vi.mock("@/services/monitoramento-instrumentos", () => ({
  criarInstrumento: vi.fn(),
}));

const DADOS = {
  referencia: "Convênio 953749",
  descricao: "Aquisição de equipamento prioritário",
  nr_convenio: "953749",
  cnpj_convenente: "00000000000100",
  nome_convenente: "Hospital de teste",
  tipo_contratacao: "Convênio",
  municipio: "Brasília",
  uf: "DF",
};

function criarWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("AdicionarMonitoramentoButton", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useAuthSession } = await import("@/hooks/useAuthSession");
    vi.mocked(useAuthSession).mockReturnValue({
      podeEditar: true,
    } as ReturnType<typeof useAuthSession>);
  });

  it("explica que é preciso login quando a pessoa não pode editar", async () => {
    const { useAuthSession } = await import("@/hooks/useAuthSession");
    vi.mocked(useAuthSession).mockReturnValue({
      podeEditar: false,
    } as ReturnType<typeof useAuthSession>);
    const { wrapper } = criarWrapper();

    render(<AdicionarMonitoramentoButton dados={DADOS} />, { wrapper });

    expect(
      screen.getByText("Faça login para adicionar este item ao monitoramento."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Adicionar ao monitoramento/i }),
    ).not.toBeInTheDocument();
  });

  it("exige técnico antes de confirmar a inclusão", async () => {
    const user = userEvent.setup();
    const { wrapper } = criarWrapper();
    render(<AdicionarMonitoramentoButton dados={DADOS} />, { wrapper });

    await user.click(
      screen.getByRole("button", { name: /Adicionar ao monitoramento/i }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      screen.getByText("Informe o técnico titular responsável."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Confirma a inclusão?" }),
    ).not.toBeInTheDocument();
  });

  it("cria, invalida a lista e fecha o diálogo após confirmação", async () => {
    const user = userEvent.setup();
    const { criarInstrumento } =
      await import("@/services/monitoramento-instrumentos");
    vi.mocked(criarInstrumento).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof criarInstrumento>>,
    );
    const { queryClient, wrapper } = criarWrapper();
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");
    render(<AdicionarMonitoramentoButton dados={DADOS} />, { wrapper });

    await user.click(
      screen.getByRole("button", { name: /Adicionar ao monitoramento/i }),
    );
    await user.type(
      screen.getByLabelText("Técnico titular responsável"),
      "  Técnica SIGEO  ",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByRole("button", { name: "Sim, adicionar" }));

    await waitFor(() =>
      expect(criarInstrumento).toHaveBeenCalledWith(
        expect.objectContaining({ tecnico_titular: "Técnica SIGEO" }),
      ),
    );
    await waitFor(() =>
      expect(invalidar).toHaveBeenCalledWith({
        queryKey: monitoramentoKeys.instrumentos,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Confirma a inclusão?" }),
      ).not.toBeInTheDocument(),
    );
  });
});
