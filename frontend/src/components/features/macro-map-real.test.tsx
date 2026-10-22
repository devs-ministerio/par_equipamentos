import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import L from "leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import type { PontoEstabelecimento } from "./macro-map";
import { MacroMapReal } from "./macro-map-real";

const svgOriginal = L.Browser.svg;
const geo: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { cod_macro: "QA" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-50, -20],
            [-50, -10],
            [-40, -10],
            [-40, -20],
            [-50, -20],
          ],
        ],
      },
    },
  ],
};

function criarPonto(
  overrides: Partial<PontoEstabelecimento> = {},
): PontoEstabelecimento {
  return {
    cnes: "0000001",
    lat: -15,
    lon: -45,
    qtd: 1,
    qtdUso: 1,
    susFlag: true,
    nome: "Unidade sintética",
    municipio: "Cidade sintética",
    uf: "GO",
    ...overrides,
  };
}

function prepararMapa() {
  // Somente capacidades de layout ausentes no jsdom; Leaflet/hook reais.
  Object.defineProperty(L.Browser, "svg", { value: true });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
}

function abrirTooltip(container: HTMLElement, indice = 0) {
  const pontos = container.querySelectorAll("path.leaflet-interactive");
  fireEvent.mouseOver(pontos[indice]);
  return screen.getByRole("tooltip");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(L.Browser, "svg", { value: svgOriginal });
});

describe("Mapa rodoviário de mérito com Leaflet real", () => {
  it("exibe nomes e identificadores como texto, sem interpretar HTML da fonte", () => {
    // Given
    prepararMapa();
    const ponto = criarPonto({
      nome: '<img src="x"> Unidade',
      cnes: "<b>0000001</b>",
      municipio: "<em>Cidade</em>",
      uf: "<i>GO</i>",
    });
    const { container } = render(<MacroMapReal geo={geo} pontos={[ponto]} />);
    // When
    const tooltip = abrirTooltip(container);
    // Then
    expect(tooltip).toHaveTextContent(ponto.nome!);
    expect(tooltip).toHaveTextContent("CNES <b>0000001</b>");
    expect(tooltip).toHaveTextContent("<em>Cidade</em> (<i>GO</i>)");
    expect(tooltip).toHaveTextContent("1 equipamento");
    expect(tooltip.querySelector("img, b, em, i")).toBeNull();
  });

  it("não interpreta HTML no nome do município selecionado", () => {
    // Given
    prepararMapa();
    const nome = "<img src=x> Município sintético";
    const { container } = render(
      <MacroMapReal
        geo={geo}
        pontos={[]}
        centro={{ lat: -15, lon: -45, nome }}
      />,
    );
    // When
    const tooltip = abrirTooltip(container);
    // Then
    expect(tooltip).toHaveTextContent(`Município: ${nome}`);
    expect(tooltip.querySelector("img")).toBeNull();
  });

  it("substitui pontos e tooltips antigos e oferece campos ausentes e plural", () => {
    // Given
    prepararMapa();
    const { container, rerender } = render(
      <MacroMapReal geo={geo} pontos={[criarPonto()]} />,
    );
    expect(abrirTooltip(container)).toHaveTextContent("Unidade sintética");
    // When
    rerender(
      <MacroMapReal
        geo={geo}
        pontos={[
          criarPonto({
            nome: null,
            municipio: null,
            uf: null,
            qtd: 2,
            susFlag: false,
          }),
        ]}
      />,
    );
    // Then
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    const tooltip = abrirTooltip(container);
    expect(tooltip).toHaveTextContent("(sem nome cadastrado)");
    expect(tooltip).toHaveTextContent("—");
    expect(tooltip).toHaveTextContent("2 equipamentos");
    expect(tooltip).not.toHaveTextContent("Unidade sintética");
    rerender(<MacroMapReal geo={geo} pontos={[]} />);
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(
      0,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "OpenStreetMap" }),
    ).toBeInTheDocument();
  });

  it("mantém um único mapa e atualiza contornos e pin no StrictMode", () => {
    // Given
    prepararMapa();
    const { container, rerender } = render(
      <StrictMode>
        <MacroMapReal geo={geo} macroId="QA" pontos={[]} />
      </StrictMode>,
    );
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(
      1,
    );
    // When
    rerender(
      <StrictMode>
        <MacroMapReal
          geo={geo}
          macroId="QA"
          contornoMunicipio={geo.features[0]}
          centro={{ lat: -15, lon: -45 }}
          pontos={[]}
        />
      </StrictMode>,
    );
    // Then
    expect(container.querySelectorAll(".leaflet-container")).toHaveLength(1);
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(
      3,
    );
    expect(abrirTooltip(container, 2)).toHaveTextContent(
      "Município selecionado",
    );
    rerender(
      <StrictMode>
        <MacroMapReal geo={geo} macroId="inexistente" pontos={[]} />
      </StrictMode>,
    );
    expect(container.querySelectorAll("path.leaflet-interactive")).toHaveLength(
      0,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
