import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import { EstabelecimentoTable } from "./estabelecimento-table";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});

function respostaEstabelecimento(nome = "Unidade sintética", sus = true) {
  return {
    data: [
      {
        cnes_code: "0000001",
        facility_name: nome,
        municipality_name: "Cidade sintética",
        macro_code: "Q1",
        macro_name: "Macro sintética",
        health_region_code: "RS1",
        health_region_name: "Região sintética",
        state: "BA",
        existing_qty: 99,
        in_use_qty: 2,
        sus_flag: sus,
        latitude: null,
        longitude: null,
        types: [],
      },
    ],
    meta: { total: 51 },
  };
}

function ultimaConsulta(http: ReturnType<typeof prepararConsultasCobertura>) {
  return new URL(String(http.fetch.mock.calls.at(-1)?.[0]), "http://localhost")
    .searchParams;
}

describe("estabelecimentos com transporte, hook e schema reais", () => {
  it("adapta o tamanho de página à mídia e reinicia ao trocar de largura", async () => {
    // Arrange
    const http = prepararConsultasCobertura();
    const media = Object.assign(new EventTarget(), { matches: true });
    vi.stubGlobal("matchMedia", () => media);
    http.fetch.mockImplementation(async () =>
      http.json(respostaEstabelecimento()),
    );
    render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
      wrapper: http.wrapper,
    });
    await screen.findAllByText("Unidade sintética");
    expect(ultimaConsulta(http).get("limit")).toBe("10");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(ultimaConsulta(http).get("offset")).toBe("10"));
    // Act
    act(() => {
      media.matches = false;
      media.dispatchEvent(new Event("change"));
    });
    // Assert
    await waitFor(() => expect(ultimaConsulta(http).get("limit")).toBe("50"));
    expect(ultimaConsulta(http).get("offset")).toBe("0");
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it.each([
    "states",
    "macroCodes",
    "healthRegionCodes",
    "municipalities",
    "cnesCodes",
  ] as const)("retorna à primeira página ao mudar %s", async (filtro) => {
    // Arrange
    const http = prepararConsultasCobertura();
    http.fetch.mockImplementation(async () =>
      http.json(respostaEstabelecimento()),
    );
    const tela = render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
      wrapper: http.wrapper,
    });
    await screen.findAllByText("Unidade sintética");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(ultimaConsulta(http).get("offset")).toBe("50"));
    // Act
    tela.rerender(
      <EstabelecimentoTable
        equipmentFamily="TOMOGRAFO"
        {...{ [filtro]: ["recorte sintético"] }}
      />,
    );
    // Assert
    await waitFor(() => expect(ultimaConsulta(http).get("offset")).toBe("0"));
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it("não oferece detalhe de cobertura SUS para unidade não SUS", async () => {
    // Arrange
    const http = prepararConsultasCobertura();
    http.fetch.mockResolvedValue(
      http.json(respostaEstabelecimento("Unidade particular sintética", false)),
    );
    // Act
    render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
      wrapper: http.wrapper,
    });
    await screen.findAllByText("Unidade particular sintética");
    // Assert
    expect(screen.getByText("SUS Não")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Detalhes" }),
    ).not.toBeInTheDocument();
    expect(http.fetch).toHaveBeenCalledTimes(1);
  });

  it("exibe dados cadastrais sem confundir quantidade existente com em uso e pagina no servidor", async () => {
    // Arrange
    const http = prepararConsultasCobertura();
    http.fetch.mockResolvedValue(http.json(respostaEstabelecimento()));
    render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
      wrapper: http.wrapper,
    });
    await screen.findAllByText("Unidade sintética");
    expect(screen.getAllByText("99").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    // Act
    http.fetch.mockResolvedValue(
      http.json(respostaEstabelecimento("Outra unidade")),
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    // Assert
    await screen.findAllByText("Outra unidade");
    expect(ultimaConsulta(http).get("limit")).toBe("50");
    expect(ultimaConsulta(http).get("offset")).toBe("50");
    expect(screen.getByText("Mostrando 51–51 de 51")).toBeInTheDocument();
  });

  it("retorna à primeira página ao trocar a família", async () => {
    // Arrange
    const http = prepararConsultasCobertura();
    http.fetch.mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      return http.json(
        url.searchParams.get("equipment_family") === "TOMOGRAFO"
          ? respostaEstabelecimento()
          : { data: [], meta: { total: 0 } },
      );
    });
    const tela = render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
      wrapper: http.wrapper,
    });
    await screen.findAllByText("Unidade sintética");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(screen.getByText("Página 2 de 2")).toBeInTheDocument(),
    );
    // Act
    tela.rerender(<EstabelecimentoTable equipmentFamily="RESSONANCIA" />);
    // Assert
    await screen.findByText("Nenhum resultado.");
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
    expect(ultimaConsulta(http).get("offset")).toBe("0");
  });

  it.each([
    "cnes_code",
    "facility_name",
    "municipality_name",
    "state",
    "existing_qty",
    "in_use_qty",
    "sus_flag",
  ])("envia ordenação %s e inverte a direção", async (campo) => {
    // Arrange
    const http = prepararConsultasCobertura();
    http.fetch.mockImplementation(async () =>
      http.json(respostaEstabelecimento()),
    );
    render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
      wrapper: http.wrapper,
    });
    await screen.findAllByText("Unidade sintética");
    // Act
    fireEvent.change(screen.getByLabelText("Ordenar por"), {
      target: { value: campo },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Ordenação crescente; inverter" }),
    );
    // Assert
    await waitFor(() =>
      expect(ultimaConsulta(http).get("sort_dir")).toBe("desc"),
    );
    expect(ultimaConsulta(http).get("sort_by")).toBe(campo);
    expect(document.querySelector('th[aria-sort="descending"]')).not.toBeNull();
  });

  it("mantém todos os filtros e reinicia a paginação na busca com debounce", async () => {
    // Arrange
    const http = prepararConsultasCobertura();
    http.fetch.mockImplementation(async () =>
      http.json(respostaEstabelecimento()),
    );
    render(
      <EstabelecimentoTable
        equipmentFamily="TOMOGRAFO"
        states={["BA", "PE"]}
        macroCodes={["Q1"]}
        healthRegionCodes={["RS1"]}
        municipalities={["Cidade sintética|BA"]}
        cnesCodes={["0000001"]}
      />,
      { wrapper: http.wrapper },
    );
    await screen.findAllByText("Unidade sintética");
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(ultimaConsulta(http).get("offset")).toBe("50"));
    const chamadas = http.fetch.mock.calls.length;
    // Act
    const busca = screen.getByPlaceholderText("Buscar nome, CNES ou município");
    fireEvent.change(busca, { target: { value: "Un" } });
    fireEvent.change(busca, { target: { value: "Unidade" } });
    expect(http.fetch).toHaveBeenCalledTimes(chamadas);
    // Assert
    await waitFor(() =>
      expect(ultimaConsulta(http).get("search")).toBe("Unidade"),
    );
    await waitFor(() => expect(ultimaConsulta(http).get("offset")).toBe("0"));
    expect(ultimaConsulta(http).getAll("state")).toEqual(["BA", "PE"]);
    expect(ultimaConsulta(http).get("macro_code")).toBe("Q1");
    expect(ultimaConsulta(http).get("health_region_code")).toBe("RS1");
    expect(ultimaConsulta(http).get("municipality")).toBe(
      "Cidade sintética|BA",
    );
    expect(ultimaConsulta(http).get("cnes_code")).toBe("0000001");
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
  });

  it.each(["vazio", "http", "schema"])(
    "trata retorno %s sem expor payload interno",
    async (cenario) => {
      // Arrange
      const http = prepararConsultasCobertura();
      http.fetch.mockResolvedValue(
        cenario === "vazio"
          ? http.json({ data: [], meta: { total: 0 } })
          : cenario === "http"
            ? http.json({ detail: "segredo interno" }, 503)
            : http.json({
                data: [{ segredo: "segredo interno" }],
                meta: { total: 1 },
              }),
      );
      render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
        wrapper: http.wrapper,
      });
      // Act / Assert
      if (cenario === "vazio")
        expect(
          await screen.findByText("Nenhum resultado."),
        ).toBeInTheDocument();
      else
        expect(
          await screen.findByText(/Não foi possível carregar \(/),
        ).toBeInTheDocument();
      expect(screen.queryByText(/segredo interno/)).not.toBeInTheDocument();
    },
  );

  it.each(["vazio", "http"])(
    "consulta detalhe apenas sob demanda e diferencia %s",
    async (cenario) => {
      // Arrange
      const http = prepararConsultasCobertura();
      http.fetch.mockImplementation(async (input) =>
        String(input).includes("municipality-coverage")
          ? cenario === "vazio"
            ? http.json([])
            : http.json({}, 503)
          : http.json(respostaEstabelecimento()),
      );
      render(<EstabelecimentoTable equipmentFamily="TOMOGRAFO" />, {
        wrapper: http.wrapper,
      });
      await screen.findAllByText("Unidade sintética");
      expect(http.fetch).toHaveBeenCalledTimes(1);
      // Act
      fireEvent.click(screen.getByRole("button", { name: "Detalhes" }));
      // Assert
      expect(
        await screen.findByText(
          cenario === "vazio"
            ? "Sem dado de cobertura pra Cidade sintética (BA)."
            : "Não foi possível carregar a cobertura de Cidade sintética (BA).",
        ),
      ).toBeInTheDocument();
      expect(ultimaConsulta(http).get("municipality")).toBe(
        "Cidade sintética|BA",
      );
    },
  );
});
