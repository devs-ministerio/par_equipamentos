import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  limparMonitoramentoHttp,
  prepararMonitoramentoHttp,
} from "@/test-fixtures/monitoramento-hooks";
import { CnesPicker } from "./cnes-picker";

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});
const estabelecimento = {
  cnes: "0000001",
  nome_estabelecimento: "Unidade CNES sintética",
  municipio: "Cidade sintética",
  uf: "BA",
};

function montar(valorAtual: string | null = null) {
  const h = prepararMonitoramentoHttp();
  h.fetch.mockImplementation(async () => h.json([estabelecimento]));
  const onEscolher = vi.fn();
  const onCancelar = vi.fn();
  render(
    <CnesPicker
      inline
      valorAtual={valorAtual}
      onEscolher={onEscolher}
      onCancelar={onCancelar}
    />,
    { wrapper: h.wrapper },
  );
  return {
    ...h,
    onEscolher,
    onCancelar,
    busca: screen.getByPlaceholderText("Buscar por nome ou código CNES..."),
  };
}

describe("seleção CNES com consulta e schema reais", () => {
  it("não consulta abaixo de dois caracteres, incluindo espaço em branco", () => {
    // Arrange
    const h = montar();
    // Act
    fireEvent.change(h.busca, { target: { value: "A " } });
    // Assert
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.onEscolher).not.toHaveBeenCalled();
  });

  it("permite escolher resultado por teclado e não transforma busca livre em CNES", async () => {
    // Arrange
    const h = montar();
    const user = userEvent.setup();
    fireEvent.change(h.busca, { target: { value: "Unidade & saúde" } });
    // Act
    const resultado = await screen.findByRole("button", {
      name: /Unidade CNES sintética/,
    });
    expect(h.onEscolher).not.toHaveBeenCalled();
    resultado.focus();
    await user.keyboard("{Enter}");
    // Assert
    expect(h.onEscolher).toHaveBeenCalledWith("0000001");
    const url = new URL(String(h.fetch.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("Unidade & saúde");
  });

  it("mostra loading sem declarar ausência antes da resposta", async () => {
    // Arrange
    const h = montar();
    let responder!: (r: Response) => void;
    h.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        responder = resolve;
      }),
    );
    // Act
    fireEvent.change(h.busca, { target: { value: "QA" } });
    expect(screen.getByText("Buscando...")).toBeInTheDocument();
    expect(
      screen.queryByText("Nenhum estabelecimento encontrado."),
    ).not.toBeInTheDocument();
    responder(h.json([]));
    // Assert
    expect(
      await screen.findByText("Nenhum estabelecimento encontrado."),
    ).toBeInTheDocument();
  });

  it.each(["http", "schema", "rede"])(
    "distingue falha %s de resultado vazio e oferece retry",
    async (falha) => {
      // Arrange
      const h = montar();
      if (falha === "rede")
        h.fetch.mockRejectedValueOnce(new Error("diagnóstico reservado"));
      else
        h.fetch.mockResolvedValueOnce(
          falha === "http"
            ? h.json({ detail: "diagnóstico reservado" }, 503)
            : h.json([{ cnes: 1 }]),
        );
      // Act
      fireEvent.change(h.busca, { target: { value: "QA" } });
      // Assert
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Não foi possível consultar o CNES.",
      );
      expect(
        screen.queryByText("Nenhum estabelecimento encontrado."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/diagnóstico reservado/),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      await screen.findByRole("button", { name: /Unidade CNES sintética/ });
      expect(h.onEscolher).not.toHaveBeenCalled();
    },
  );

  it("limpa apenas por ação explícita e cancela sem escolher", () => {
    // Arrange
    const h = montar("0000001");
    // Act
    fireEvent.click(
      screen.getByRole("button", { name: "Limpar CNES atual (0000001)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    // Assert
    expect(h.onEscolher).toHaveBeenCalledExactlyOnceWith(null);
    expect(h.onCancelar).toHaveBeenCalledOnce();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("ignora resposta atrasada de busca anterior", async () => {
    // Arrange
    const h = montar();
    let responder!: (r: Response) => void;
    h.fetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          responder = resolve;
        }),
      )
      .mockResolvedValueOnce(
        h.json([
          {
            ...estabelecimento,
            cnes: "0000002",
            nome_estabelecimento: "Unidade atual",
          },
        ]),
      );
    // Act
    fireEvent.change(h.busca, { target: { value: "antiga" } });
    fireEvent.change(h.busca, { target: { value: "atual" } });
    await screen.findByText("Unidade atual");
    await act(async () => {
      responder(h.json([estabelecimento]));
    });
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
    // Assert
    expect(
      screen.queryByText("Unidade CNES sintética"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Unidade atual")).toBeInTheDocument();
  });
});
