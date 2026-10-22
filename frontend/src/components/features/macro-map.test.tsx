import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import type { CoberturaRow, Macrorregiao } from "@/types/domain";
import { MacroMap } from "./macro-map";

const geo: FeatureCollection = {
  type: "FeatureCollection",
  features: [1, 2, 3].map((id) => ({
    type: "Feature",
    properties: { cod_macro: `QA${id}` },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [id * 5 - 60, -20],
          [id * 5 - 60, -10],
          [id * 5 - 55, -10],
          [id * 5 - 55, -20],
          [id * 5 - 60, -20],
        ],
      ],
    },
  })),
};
function criarMacro(id = "QA1", nome = "Macro sintética"): Macrorregiao {
  return {
    id,
    nome,
    uf: "GO",
    regiao: "Centro-Oeste",
    pop: 100000,
    popResidente: 120000,
    popAns: 20000,
    nomeEstado: "Goiás",
  };
}
function criarCobertura(overrides: Partial<CoberturaRow> = {}): CoberturaRow {
  return {
    macroId: "QA1",
    oferta: 1,
    ofertaTotal: 2,
    demanda: 1,
    cobertura: 100,
    status: "Hiperssuficiente",
    ...overrides,
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Mapa nacional de mérito com D3 real", () => {
  it("permite selecionar uma macro por Enter e Espaço, com nome e foco acessíveis", async () => {
    // Given
    const onSelectMacro = vi.fn();
    const user = userEvent.setup();
    render(
      <MacroMap
        geo={geo}
        macros={[criarMacro()]}
        coberturaRows={[criarCobertura()]}
        onSelectMacro={onSelectMacro}
      />,
    );
    // When
    await user.tab();
    const macro = screen.getByRole("button", { name: "Macro sintética (GO)" });
    // Then
    expect(macro).toHaveFocus();
    expect(screen.getByRole("tooltip")).toBeVisible();
    expect(macro).toHaveAccessibleDescription(/Macro sintética/);
    await user.keyboard("a{ArrowDown}");
    expect(onSelectMacro).not.toHaveBeenCalled();
    await user.keyboard("{Enter} ");
    expect(onSelectMacro.mock.calls).toEqual([["QA1"], ["QA1"]]);
    fireEvent.blur(macro);
    expect(screen.getByRole("tooltip", { hidden: true })).not.toBeVisible();
  });

  it("mostra e oculta tooltip no mouse e preserva HTML da fonte como texto", () => {
    // Given
    const onSelectMacro = vi.fn();
    const { container } = render(
      <MacroMap
        geo={geo}
        macros={[criarMacro("QA1", "<img src=x> Macro")]}
        coberturaRows={[criarCobertura()]}
        onSelectMacro={onSelectMacro}
      />,
    );
    const path = container.querySelector("path")!;
    // When
    fireEvent.mouseMove(path, { clientX: 100, clientY: 150 });
    // Then
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("<img src=x> Macro (GO)");
    expect(tooltip.querySelector("img")).toBeNull();
    expect(tooltip).toHaveTextContent("Hiperssuficiente");
    fireEvent.click(path);
    expect(onSelectMacro).toHaveBeenCalledWith("QA1");
    fireEvent.mouseLeave(path);
    expect(tooltip).not.toBeVisible();
  });

  it("atualiza seleção, status e macro sem cobertura sem acumular mapas ou tooltips", () => {
    // Given
    const props = {
      geo,
      macros: [criarMacro(), criarMacro("QA2", "Outra macro")],
      coberturaRows: [criarCobertura()],
      onSelectMacro: vi.fn(),
    };
    const { container, rerender } = render(
      <StrictMode>
        <MacroMap {...props} selectedMacroId="QA1" />
      </StrictMode>,
    );
    expect(container.querySelector("path")).toHaveAttribute(
      "stroke-width",
      "2",
    );
    // When
    rerender(
      <StrictMode>
        <MacroMap
          {...props}
          selectedMacroId="QA2"
          coberturaRows={[criarCobertura({ status: "Dados indisponíveis" })]}
        />
      </StrictMode>,
    );
    const paths = container.querySelectorAll("path");
    // Then
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getAllByRole("tooltip", { hidden: true })).toHaveLength(1);
    expect(paths[0]).toHaveAttribute("stroke-width", "0.6");
    expect(paths[1]).toHaveAttribute("stroke-width", "2");
    expect(paths[0]).toHaveAttribute("aria-pressed", "false");
    expect(paths[1]).toHaveAttribute("aria-pressed", "true");
    fireEvent.mouseMove(paths[0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Dados indisponíveis",
    );
    fireEvent.mouseMove(paths[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Outra macro (GO)");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Coeficiente: —");
    fireEvent.mouseMove(paths[2]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Código QA3");
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Sem dado nessa competência",
    );
  });

  it("recorta a macro selecionada e mantém pontos decorativos fora da navegação", () => {
    // Given
    const onSelectMacro = vi.fn();
    const ref = createRef<HTMLDivElement>();
    const { container, rerender } = render(
      <MacroMap
        ref={ref}
        geo={geo}
        macros={[criarMacro()]}
        coberturaRows={[]}
        zoomMacroId="QA1"
        raioKm={75}
        pontos={[
          {
            cnes: "0000001",
            lat: -15,
            lon: -52,
            qtd: 1,
            qtdUso: 1,
            susFlag: true,
          },
          {
            cnes: "0000002",
            lat: -15,
            lon: -51,
            qtd: 2,
            qtdUso: 0,
            susFlag: false,
          },
        ]}
        onSelectMacro={onSelectMacro}
      />,
    );
    // When
    fireEvent.click(
      screen.getByRole("button", { name: "Macro sintética (GO)" }),
    );
    // Then
    expect(ref.current).toBe(container.firstElementChild);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(
      container.querySelectorAll('path[pointer-events="none"]'),
    ).toHaveLength(1);
    expect(container).toHaveTextContent(/km/);
    expect(onSelectMacro).toHaveBeenCalledWith("QA1");
    rerender(
      <MacroMap
        ref={ref}
        geo={geo}
        macros={[]}
        coberturaRows={[]}
        zoomMacroId="não existe"
        pontos={[]}
        onSelectMacro={onSelectMacro}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container).not.toHaveTextContent(/km/);
  });

  it("não oferece seleção para geometria sem código e aceita recorte vazio", () => {
    // Given
    const onSelectMacro = vi.fn();
    const semCodigo: FeatureCollection = {
      ...geo,
      features: [{ ...geo.features[0], properties: null }],
    };
    const { container, rerender } = render(
      <MacroMap
        geo={semCodigo}
        macros={[]}
        coberturaRows={[]}
        onSelectMacro={onSelectMacro}
      />,
    );
    const path = container.querySelector("path")!;
    // When
    fireEvent.mouseMove(path);
    fireEvent.click(path);
    // Then
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Código —");
    expect(onSelectMacro).not.toHaveBeenCalled();
    rerender(
      <MacroMap
        geo={{ type: "FeatureCollection", features: [] }}
        macros={[]}
        coberturaRows={[]}
        onSelectMacro={onSelectMacro}
      />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
