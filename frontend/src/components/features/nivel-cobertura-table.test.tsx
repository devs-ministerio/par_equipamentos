import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import {
  criarNivelResposta,
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import { NivelCoberturaTable } from "./nivel-cobertura-table";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});
type Props = ComponentProps<typeof NivelCoberturaTable>;

function prepararTabela() {
  const http = prepararConsultasCobertura();
  const rows = Array.from({ length: 21 }, (_, indice) => ({
    ...criarNivelResposta(
      String(indice + 1).padStart(2, "0"),
      indice === 0 ? "deficient" : "not_deficient",
    ),
    population: 100_000 + indice,
    coverage_percentage: indice,
  }));
  const props: Props = {
    equipmentFamily: "TOMOGRAFO",
    nivel: "regiaoSaude",
    statusFiltro: new Set(),
    subNivelSelecionados: [],
  };
  http.fetch.mockImplementation(async () => http.json(rows));
  const tela = render(<NivelCoberturaTable {...props} />, {
    wrapper: http.wrapper,
  });
  return { ...http, rows, props, tela };
}

describe("cobertura por região e município com consultas reais", () => {
  it("ajusta a página quando uma atualização reduz o total do mesmo recorte", async () => {
    // Arrange
    const h = prepararTabela();
    await screen.findAllByText("Região sintética 01");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    h.fetch.mockResolvedValueOnce(h.json(h.rows.slice(0, 1)));
    // Act
    await h.client.invalidateQueries();
    // Assert
    await waitFor(() =>
      expect(screen.getByText("Mostrando 1–1 de 1")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Região sintética 01")).toHaveLength(2);
  });

  it.each([
    ["família", { equipmentFamily: "RESSONANCIA" }],
    ["corte", { semCorteDePopulacao: true }],
    ["nível", { nivel: "municipio" }],
    ["UF", { states: ["PE"] }],
    ["macro", { macroCodes: ["Q2"] }],
    ["região", { healthRegionCodes: ["RS2"] }],
    ["município", { municipalities: ["Cidade sintética|BA"] }],
  ] satisfies [string, Partial<Props>][])(
    "reinicia a página ao trocar %s",
    async (_, alteracao) => {
      // Arrange
      const h = prepararTabela();
      await screen.findAllByText("Região sintética 01");
      fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
      expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
      // Act
      h.tela.rerender(<NivelCoberturaTable {...h.props} {...alteracao} />);
      // Assert
      await waitFor(() =>
        expect(screen.getByText("Página 1 de 2")).toBeInTheDocument(),
      );
      expect(screen.queryByText("Nenhum resultado.")).not.toBeInTheDocument();
    },
  );

  it.each(["nome", "uf", "populacao", "cobertura", "status"])(
    "ordena por %s, inverte e retorna à primeira página",
    async (campo) => {
      // Arrange
      prepararTabela();
      await screen.findAllByText("Região sintética 01");
      fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
      // Act
      fireEvent.change(screen.getByLabelText("Ordenar por"), {
        target: { value: campo },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Ordenação crescente; inverter" }),
      );
      // Assert
      expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Ordenação decrescente; inverter" }),
      ).toBeInTheDocument();
      if (["nome", "populacao", "cobertura"].includes(campo))
        expect(
          screen.getAllByText(/Região sintética \d+/)[0],
        ).toHaveTextContent("Região sintética 21");
    },
  );

  it("ordena pelo cabeçalho acessível sem disparar outra consulta", async () => {
    // Arrange
    const h = prepararTabela();
    await screen.findAllByText("Região sintética 01");
    // Act
    fireEvent.click(screen.getByRole("button", { name: "Região de saúde" }));
    // Assert
    expect(screen.getAllByText(/Região sintética \d+/)[0]).toHaveTextContent(
      "Região sintética 21",
    );
    expect(
      screen.getByRole("columnheader", { name: "Região de saúde" }),
    ).toHaveAttribute("aria-sort", "descending");
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("aplica status da fonte e distingue ausência no recorte", async () => {
    // Arrange
    const h = prepararTabela();
    await screen.findAllByText("Região sintética 01");
    // Act / Assert
    h.tela.rerender(
      <NivelCoberturaTable
        {...h.props}
        statusFiltro={new Set(["Hipossuficiente"])}
      />,
    );
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeInTheDocument();
    h.tela.rerender(
      <NivelCoberturaTable
        {...h.props}
        statusFiltro={new Set(["Dados indisponíveis"])}
      />,
    );
    expect(screen.getByText("Nenhum resultado.")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 0–0 de 0")).toBeInTheDocument();
  });

  it.each(["http", "schema"])(
    "mostra falha %s sem exibir diagnóstico técnico",
    async (cenario) => {
      // Arrange
      const h = prepararConsultasCobertura();
      h.fetch.mockResolvedValue(
        cenario === "http"
          ? h.json({ detail: "diagnóstico reservado" }, 503)
          : h.json([{ diagnosis: "diagnóstico reservado" }]),
      );
      // Act
      render(
        <NivelCoberturaTable
          equipmentFamily="TOMOGRAFO"
          nivel="municipio"
          subNivelSelecionados={[]}
          statusFiltro={new Set()}
        />,
        { wrapper: h.wrapper },
      );
      // Assert
      expect(
        await screen.findByText(/Não foi possível carregar \(/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/diagnóstico reservado/),
      ).not.toBeInTheDocument();
    },
  );

  it("expande municípios sob demanda e recolhe sem nova consulta", async () => {
    // Arrange
    const h = prepararTabela();
    await screen.findAllByText("Região sintética 01");
    let responder!: (response: Response) => void;
    h.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        responder = resolve;
      }),
    );
    // Act
    fireEvent.click(screen.getAllByText("Região sintética 01")[0]);
    expect(screen.getByText("Carregando municípios...")).toBeInTheDocument();
    responder(h.json([criarNivelResposta("M1")]));
    // Assert
    await screen.findAllByText("Cidade sintética M1");
    const consulta = new URL(String(h.fetch.mock.calls[1][0]));
    expect(consulta.searchParams.get("health_region_code")).toBe("01");
    fireEvent.click(screen.getAllByText("Região sintética 01")[0]);
    expect(screen.queryByText("Cidade sintética M1")).not.toBeInTheDocument();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["vazio", "http"])(
    "mostra expansão %s sem perder a região pai",
    async (cenario) => {
      // Arrange
      const h = prepararTabela();
      await screen.findAllByText("Região sintética 01");
      h.fetch.mockResolvedValueOnce(
        cenario === "vazio" ? h.json([]) : h.json({}, 503),
      );
      // Act
      fireEvent.click(screen.getAllByText("Região sintética 01")[0]);
      // Assert
      expect(
        await screen.findByText(
          cenario === "vazio"
            ? "Nenhuma município encontrada."
            : "Não foi possível carregar os municípios.",
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByText("Região sintética 01")).toHaveLength(2);
    },
  );

  it("abre detalhe municipal real e descarta a linha antiga ao mudar de família", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockResolvedValue(h.json([criarNivelResposta("M1")]));
    const props: Props = {
      equipmentFamily: "TOMOGRAFO",
      nivel: "municipio",
      subNivelSelecionados: [],
      statusFiltro: new Set(),
    };
    const tela = render(<NivelCoberturaTable {...props} />, {
      wrapper: h.wrapper,
    });
    await screen.findAllByText("Cidade sintética M1");
    // Act
    const linha = screen.getAllByText("Cidade sintética M1")[0].closest("tr")!;
    fireEvent.click(
      within(linha).getByRole("button", { name: "Mais informações" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    tela.rerender(
      <NivelCoberturaTable {...props} equipmentFamily="RESSONANCIA" />,
    );
    // Assert
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("não deixa a resposta atrasada do recorte antigo sobrescrever a tabela atual", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    let antigo!: (response: Response) => void;
    h.fetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          antigo = resolve;
        }),
      )
      .mockResolvedValueOnce(h.json([criarNivelResposta("ATUAL")]));
    const props: Props = {
      equipmentFamily: "TOMOGRAFO",
      nivel: "municipio",
      subNivelSelecionados: [],
      statusFiltro: new Set(),
    };
    const tela = render(<NivelCoberturaTable {...props} />, {
      wrapper: h.wrapper,
    });
    expect(screen.queryByText("Nenhum resultado.")).not.toBeInTheDocument();
    // Act
    tela.rerender(
      <NivelCoberturaTable {...props} municipalities={["Cidade atual|BA"]} />,
    );
    await screen.findAllByText("Cidade sintética ATUAL");
    antigo(h.json([criarNivelResposta("ANTIGO")]));
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
    // Assert
    expect(
      screen.queryByText("Cidade sintética ANTIGO"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getAllByText("Cidade sintética ATUAL"),
    ).toHaveLength(2);
  });
});
