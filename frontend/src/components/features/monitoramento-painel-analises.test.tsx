import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useMonitoramentoInternoFiltros } from "@/hooks/use-monitoramento-interno-filtros";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import { criarInstrumentoTeste } from "@/test-fixtures/monitoramento-hooks";
import { MonitoramentoInternoFiltros } from "./monitoramento-interno-filtros";
import { MonitoramentoPainelAnalises } from "./monitoramento-painel-analises";

const fases = ["Não iniciado", "Concluído"];
const carteira = [
  criarInstrumentoTeste({
    id: 1,
    nr_convenio: "QA001",
    municipio: "ANÁPOLIS",
    uf: "GO",
    ano_instrumento: 2025,
    fase_atual: "Concluído",
  }),
  criarInstrumentoTeste({
    id: 2,
    nr_convenio: "QA002",
    municipio: "anápolis",
    uf: "GO",
    ano_instrumento: 2026,
    fase_atual: "Não iniciado",
    tipo_contratacao: "TED",
  }),
  criarInstrumentoTeste({
    id: 3,
    nr_convenio: "QA003",
    municipio: "Cidade Beta",
    uf: "BA",
    ano_instrumento: 2026,
    fase_atual: "Concluído",
  }),
];

function PainelFiltravel() {
  const filtros = useMonitoramentoInternoFiltros(carteira);
  return (
    <>
      <MonitoramentoInternoFiltros filtros={filtros} />
      <MonitoramentoPainelAnalises
        instrumentos={filtros.filtrados}
        fases={fases}
      />
    </>
  );
}

describe("Panorama do painel com dados e filtros reais", () => {
  it("recalcula os gráficos ao selecionar município agrupado e restaura ao limpar", async () => {
    // Given
    render(
      <MemoryRouter>
        <PainelFiltravel />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    expect(
      screen.getByRole("img", { name: "2025: 1; 2026: 2" }),
    ).toBeInTheDocument();
    // When
    await user.click(screen.getByRole("button", { name: /^Município/ }));
    await user.click(screen.getByRole("option", { name: "Anápolis" }));
    // Then: ambos os registros da cidade, não apenas uma variante da fonte.
    expect(screen.getByText("2 de 3 instrumentos")).toBeInTheDocument();
    expect(screen.getByText("2 instrumentos")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Não iniciado: 1; Concluído: 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "2025: 1; 2026: 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Convênio: 1; TED: 1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveTextContent("GO");
    expect(screen.getByRole("list")).not.toHaveTextContent("BA");
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(
      screen.getByRole("img", { name: "2025: 1; 2026: 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 instrumentos")).toBeInTheDocument();
  });

  it("remove os gráficos anteriores quando a combinação de filtros não encontra dados", async () => {
    // Given
    render(
      <MemoryRouter>
        <PainelFiltravel />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    // When
    await user.type(
      screen.getByRole("textbox", {
        name: "Buscar número, convenente, CNES ou município",
      }),
      "Sem correspondência",
    );
    // Then
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(
      screen.getAllByText("Nenhum instrumento neste recorte."),
    ).toHaveLength(3);
    expect(screen.getByText("Nenhum ano informado.")).toBeInTheDocument();
    expect(screen.getByText("Top 5: 0%")).toBeInTheDocument();
  });

  it("explicita ausências de ano/UF e preserva o denominador da concentração", () => {
    // Given
    const itens = [
      carteira[0]!,
      criarInstrumentoTeste({
        id: 4,
        uf: null,
        ano_instrumento: null,
        tipo_contratacao: null,
        fase_atual: null,
      }),
    ];
    // When
    render(<MonitoramentoPainelAnalises instrumentos={itens} fases={fases} />);
    // Then
    expect(screen.getByText("1 registros sem ano.")).toBeInTheDocument();
    expect(
      screen.getByText("1 registros sem UF informada."),
    ).toBeInTheDocument();
    expect(screen.getByText("Top 5: 50%")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Convênio: 1; Não informado: 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Não iniciado: 1; Concluído: 1" }),
    ).toBeInTheDocument();
  });

  it("respeita limites visuais de anos/tipos/UF sem reduzir o total da carteira", () => {
    // Given: carteira inteiramente sintética para testar limites de apresentação.
    const ufs = ["AL", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT"];
    const itens = ufs.map((uf, indice) =>
      criarInstrumentoTeste({
        id: indice + 1,
        ano_instrumento: 2010 + indice,
        uf,
        tipo_contratacao: `Tipo ${indice}`,
        fase_atual: "Fase adicional",
      }),
    );
    const originais = structuredClone(itens);
    // When
    render(<MonitoramentoPainelAnalises instrumentos={itens} fases={fases} />);
    // Then
    expect(screen.getByText("10 instrumentos")).toBeInTheDocument();
    expect(
      screen.getByText("2 anos anteriores não exibidos."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /2012: 1; 2013: 1/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /2010: 1/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Outras: 5$/ })).toBeInTheDocument();
    expect(
      within(screen.getByRole("list")).getAllByRole("listitem"),
    ).toHaveLength(7);
    expect(screen.getByText("Top 5: 50%")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Fase adicional: 10" }),
    ).toBeInTheDocument();
    expect(itens).toEqual(originais);
  });

  it("atualiza dados recebidos sem reter série ou legenda de um recorte anterior", () => {
    // Given
    const { rerender } = render(
      <MonitoramentoPainelAnalises instrumentos={carteira} fases={fases} />,
    );
    // When
    const itens: InstrumentoEquipamento[] = [
      criarInstrumentoTeste({
        ano_instrumento: 1800,
        uf: null,
        fase_atual: "Fase nova",
      }),
    ];
    rerender(
      <MonitoramentoPainelAnalises instrumentos={itens} fases={fases} />,
    );
    // Then
    expect(screen.queryByRole("img", { name: /2025/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Fase nova: 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum ano informado.")).toBeInTheDocument();
    expect(screen.getByText("1 registros sem ano.")).toBeInTheDocument();
    expect(
      screen.getByText("1 registros sem UF informada."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
