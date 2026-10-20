import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CoberturaRow, StatusCobertura } from "@/types/domain";
import { criarBaseTerritorial } from "@/test-fixtures/filtros-territoriais";
import {
  criarNivelResposta,
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import { CoberturaTable } from "./cobertura-table";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});

function criarCarteira(quantidade = 24) {
  const base = criarBaseTerritorial();
  const macros = Array.from({ length: quantidade }, (_, indice) => ({
    ...base.macros[0],
    id: `Q${String(indice + 1).padStart(2, "0")}`,
    nome: `Macro sintética ${String(indice + 1).padStart(2, "0")}`,
    pop: 100_000 + indice,
  }));
  const rows: CoberturaRow[] = macros.map((macro, indice) => ({
    ...base.coberturaRows[0],
    macroId: macro.id,
    cobertura: indice,
    status: indice === 0 ? "Hipossuficiente" : "Hiperssuficiente",
  }));
  return {
    equipmentFamily: "TOMOGRAFO",
    macros,
    rows,
    subNivelSelecionados: [],
    statusFiltro: new Set<StatusCobertura>(),
  };
}

describe("tabela de cobertura com componentes e consultas reais", () => {
  it("pagina macros sem consultar regiões antes de expandir", () => {
    // Arrange / Act
    const http = prepararConsultasCobertura();
    render(<CoberturaTable {...criarCarteira()} />, { wrapper: http.wrapper });
    expect(screen.getByText("Mostrando 1–20 de 24")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    // Assert
    expect(screen.getByText("Mostrando 21–24 de 24")).toBeInTheDocument();
    expect(screen.queryByText("Macro sintética 01")).not.toBeInTheDocument();
    expect(http.fetch).not.toHaveBeenCalled();
  });

  it("volta à primeira página quando o recorte diminui", () => {
    // Arrange
    const http = prepararConsultasCobertura();
    const props = criarCarteira();
    const tela = render(<CoberturaTable {...props} />, {
      wrapper: http.wrapper,
    });
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    // Act
    tela.rerender(<CoberturaTable {...props} rows={props.rows.slice(0, 1)} />);
    // Assert
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeInTheDocument();
    expect(screen.getAllByText("Macro sintética 01")).toHaveLength(2);
  });

  it("reinicia a página ao mudar a família mesmo com as mesmas linhas", () => {
    // Arrange
    const http = prepararConsultasCobertura();
    const props = criarCarteira();
    const tela = render(<CoberturaTable {...props} />, {
      wrapper: http.wrapper,
    });
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    // Act
    tela.rerender(<CoberturaTable {...props} equipmentFamily="RESSONANCIA" />);
    // Assert
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it("filtra pelo status recebido e informa recorte sem resultados", () => {
    // Arrange
    const http = prepararConsultasCobertura();
    const props = criarCarteira();
    const tela = render(<CoberturaTable {...props} />, {
      wrapper: http.wrapper,
    });
    // Act / Assert
    tela.rerender(
      <CoberturaTable {...props} statusFiltro={new Set(["Hipossuficiente"])} />,
    );
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeInTheDocument();
    tela.rerender(
      <CoberturaTable
        {...props}
        statusFiltro={new Set(["Dados indisponíveis"])}
      />,
    );
    expect(screen.getByText("Nenhum resultado.")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 0–0 de 0")).toBeInTheDocument();
  });

  it.each(["codigo", "macro", "uf", "populacao", "cobertura", "status"])(
    "ordena por %s e permite inverter a direção",
    (campo) => {
      // Arrange
      const http = prepararConsultasCobertura();
      render(<CoberturaTable {...criarCarteira(2)} />, {
        wrapper: http.wrapper,
      });
      // Act
      fireEvent.change(screen.getByLabelText("Ordenar por"), {
        target: { value: campo },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Ordenação crescente; inverter" }),
      );
      // Assert: cabeçalho acessível acompanha o controle móvel real.
      expect(
        screen.getByRole("button", { name: "Ordenação decrescente; inverter" }),
      ).toBeInTheDocument();
      expect(
        document.querySelector('th[aria-sort="descending"]'),
      ).not.toBeNull();
      if (["codigo", "macro", "populacao", "cobertura"].includes(campo)) {
        expect(
          screen.getAllByText(/Macro sintética 0[12]/)[0],
        ).toHaveTextContent("Macro sintética 02");
      }
    },
  );

  it("expande sob demanda, mostra carregamento, dados e recolhe sem nova consulta", async () => {
    // Arrange
    const http = prepararConsultasCobertura();
    let responder!: (response: Response) => void;
    http.fetch.mockReturnValue(
      new Promise((resolve) => {
        responder = resolve;
      }),
    );
    render(<CoberturaTable {...criarCarteira(1)} />, { wrapper: http.wrapper });
    // Act
    fireEvent.click(screen.getAllByText("Macro sintética 01")[0]);
    expect(
      screen.getByText("Carregando regiões de saúde..."),
    ).toBeInTheDocument();
    responder(http.json([criarNivelResposta("RS1")]));
    // Assert
    await waitFor(() =>
      expect(
        screen.getAllByText("Região sintética RS1").length,
      ).toBeGreaterThan(0),
    );
    const url = new URL(
      String(http.fetch.mock.calls[0][0]),
      "http://localhost",
    );
    expect(url.searchParams.get("macro_code")).toBe("Q01");
    expect(url.searchParams.get("equipment_family")).toBe("TOMOGRAFO");
    fireEvent.click(screen.getAllByText("Macro sintética 01")[0]);
    expect(screen.queryByText("Região sintética RS1")).not.toBeInTheDocument();
    expect(http.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["vazio", "http", "schema"])(
    "trata expansão com retorno %s sem inventar cobertura",
    async (cenario) => {
      // Arrange
      const http = prepararConsultasCobertura();
      http.fetch.mockResolvedValue(
        cenario === "vazio"
          ? http.json([])
          : cenario === "http"
            ? http.json({}, 503)
            : http.json([{ segredo: "não exibir" }]),
      );
      render(<CoberturaTable {...criarCarteira(1)} />, {
        wrapper: http.wrapper,
      });
      // Act
      fireEvent.click(screen.getAllByText("Macro sintética 01")[0]);
      // Assert
      expect(
        await screen.findByText(
          cenario === "vazio"
            ? "Nenhuma região de saúde encontrada."
            : "Não foi possível carregar as regiões de saúde.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("não exibir")).not.toBeInTheDocument();
    },
  );
});
