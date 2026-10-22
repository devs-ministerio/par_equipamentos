import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import L from "leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapaRodoviarioSecao } from "./mapa-rodoviario-secao";

type Props = ComponentProps<typeof MapaRodoviarioSecao>;
const svgOriginal = L.Browser.svg;
function criarProps(overrides: Partial<Props> = {}): Props {
  return {
    geo: { type: "FeatureCollection", features: [] },
    familia: "TOMOGRAFO",
    macros: [
      {
        id: "QA",
        nome: "Macro sintética",
        uf: "GO",
        regiao: "Centro-Oeste",
        pop: 100000,
        popResidente: 120000,
        popAns: 20000,
        nomeEstado: "Goiás",
      },
    ],
    selectedMacroId: null,
    setSelectedMacroId: vi.fn(),
    municipiosMacro: [],
    selectedMunicipioId: null,
    setSelectedMunicipioId: vi.fn(),
    municipioSelecionado: undefined,
    infoSelecionado: undefined,
    distanciaMaisProximaKm: null,
    nomeEquipamentoMaisProximo: null,
    pontosMacro: [],
    totalEstabelecimentosNoRaio: null,
    contornoMunicipio: null,
    erroContornoMunicipio: null,
    ...overrides,
  };
}
function criarMunicipio(): NonNullable<Props["municipioSelecionado"]> {
  return {
    chave: "QA1",
    nome: "Cidade sintética",
    uf: "GO",
    macroId: "QA",
    macroNome: "Macro sintética",
    pop: 100000,
    popResidente: 120000,
    popAns: 20000,
    oferta: 1,
    ofertaTotal: 2,
    cobertura: 100,
    status: "Hiperssuficiente",
    latitude: -15,
    longitude: -45,
  };
}
function prepararLayout() {
  Object.defineProperty(L.Browser, "svg", { value: true });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(L.Browser, "svg", { value: svgOriginal });
});
describe("Composição do mapa rodoviário de mérito", () => {
  it("não monta o mapa nem inventa resumo antes de selecionar um recorte", () => {
    // Given
    const props = criarProps();
    // When
    const { container } = render(<MapaRodoviarioSecao {...props} />);
    // Then
    expect(
      screen.getByText("Equipamentos — Mapa Rodoviário"),
    ).toBeInTheDocument();
    expect(container.querySelector(".leaflet-container")).toBeNull();
    expect(screen.queryByText("Total de equipamentos")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Limpar filtros" }),
    ).not.toBeInTheDocument();
  });

  it("seleciona macro e município pelos filtros e limpa os dois no mesmo fluxo", async () => {
    // Given
    prepararLayout();
    const props = criarProps({ municipiosMacro: [criarMunicipio()] });
    function Tela() {
      const [macro, setMacro] = useState<string | null>(null);
      const [municipio, setMunicipio] = useState<string | null>(null);
      return (
        <MapaRodoviarioSecao
          {...props}
          selectedMacroId={macro}
          setSelectedMacroId={setMacro}
          selectedMunicipioId={municipio}
          setSelectedMunicipioId={setMunicipio}
        />
      );
    }
    const user = userEvent.setup();
    const { container } = render(<Tela />);
    // When
    await user.click(
      screen.getByRole("button", { name: /^Selecione uma macrorregião/ }),
    );
    await user.click(
      screen.getByRole("option", { name: "GO · QA · Macro sintética" }),
    );
    await user.click(
      screen.getByRole("button", { name: /^Toda a macrorregião/ }),
    );
    await user.click(
      screen.getByRole("option", { name: "Cidade sintética (GO)" }),
    );
    // Then
    expect(
      screen.getByRole("button", { name: /^Cidade sintética \(GO\)/ }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(container.querySelectorAll(".leaflet-container")).toHaveLength(1),
    );
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(
      screen.getByRole("button", { name: /^Selecione uma macrorregião/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Toda a macrorregião/ }),
    ).toBeInTheDocument();
    expect(container.querySelector(".leaflet-container")).toBeNull();
  });

  it("mostra recorte vazio e preserva atribuição do mapa mesmo sem estabelecimentos", async () => {
    // Given
    prepararLayout();
    // When
    render(<MapaRodoviarioSecao {...criarProps({ selectedMacroId: "QA" })} />);
    // Then
    expect(
      screen.getByText(
        "Nenhum estabelecimento geocodificado encontrado nesse recorte.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "OpenStreetMap" }),
    ).toBeInTheDocument();
  });

  it("diferencia contorno pendente, indisponível e carregado sem perder o pin", async () => {
    // Given
    prepararLayout();
    const props = criarProps({ municipioSelecionado: criarMunicipio() });
    const { container, rerender } = render(<MapaRodoviarioSecao {...props} />);
    expect(
      screen.getByText("buscando contorno do município..."),
    ).toBeInTheDocument();
    await screen.findByRole("link", { name: "OpenStreetMap" });
    // When
    rerender(
      <MapaRodoviarioSecao
        {...props}
        erroContornoMunicipio={new Error("Falha sintética")}
      />,
    );
    // Then
    expect(screen.getByRole("status")).toHaveTextContent(
      "Não foi possível carregar o contorno do município selecionado.",
    );
    expect(screen.getByText("contorno indisponível")).toBeInTheDocument();
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(
      1,
    );
    const contorno: NonNullable<Props["contornoMunicipio"]> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-46, -16],
            [-46, -14],
            [-44, -14],
            [-44, -16],
            [-46, -16],
          ],
        ],
      },
    };
    rerender(<MapaRodoviarioSecao {...props} contornoMunicipio={contorno} />);
    expect(
      screen.getByText("contorno do município selecionado"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(
      2,
    );
  });

  it("informa quando a lista mostra apenas parte dos estabelecimentos encontrados", async () => {
    // Given
    prepararLayout();
    const props = criarProps({
      municipioSelecionado: criarMunicipio(),
      totalEstabelecimentosNoRaio: 5,
      pontosMacro: [
        {
          cnes: "0000001",
          lat: -15,
          lon: -45,
          qtd: 1,
          qtdUso: 1,
          susFlag: true,
        },
      ],
    });
    const { rerender } = render(<MapaRodoviarioSecao {...props} />);
    // When
    await screen.findByRole("link", { name: "OpenStreetMap" });
    // Then
    expect(
      screen.getByText(/os 1 estabelecimentos mais próximos \(de 5 dentro de/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Nenhum estabelecimento geocodificado/),
    ).not.toBeInTheDocument();
    rerender(
      <MapaRodoviarioSecao {...props} totalEstabelecimentosNoRaio={1} />,
    );
    expect(
      screen.getByText(/Mostrando estabelecimentos num raio de/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mais próximos \(de 5/)).not.toBeInTheDocument();
  });

  it.each([
    ["TOMOGRAFO", 75, "var(--success)"],
    ["TOMOGRAFO", 76, "var(--destructive)"],
    ["RESSONANCIA", 76, ""],
    ["TOMOGRAFO", null, ""],
  ])(
    "apresenta resumo de %s com distância %s sem mudar o dado recebido",
    (familia, distancia, cor) => {
      // Given
      const props = criarProps({
        familia,
        distanciaMaisProximaKm: distancia,
        infoSelecionado: { pop: 120000, ofertaTotal: 12 },
      });
      // When
      const { rerender } = render(<MapaRodoviarioSecao {...props} />);
      // Then
      expect(screen.getByTitle("120.000")).toBeInTheDocument();
      expect(screen.getByTitle("12")).toBeInTheDocument();
      const valor = screen.getByText("Distância mais próxima")
        .nextElementSibling as HTMLElement;
      expect(valor).toHaveTextContent(
        distancia === null ? "—" : `${distancia} km`,
      );
      expect(valor.style.color).toBe(cor);
      expect(
        screen.getByText("Equipamento mais próximo").nextElementSibling,
      ).toHaveTextContent("—");
      rerender(
        <MapaRodoviarioSecao
          {...props}
          nomeEquipamentoMaisProximo="Unidade sintética"
        />,
      );
      expect(screen.getByTitle("Unidade sintética")).toBeInTheDocument();
    },
  );
});
