import { act, cleanup, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import L from "leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepararPainel } from "@/test-fixtures/monitoramento-painel";
import {
  criarInstrumentoTeste,
  limparMonitoramentoHttp,
} from "@/test-fixtures/monitoramento-hooks";
import { criarMacroResposta } from "@/test-fixtures/consultas-cobertura";
import { MonitoramentoPainelGeografia } from "./monitoramento-painel-geografia";

const svgOriginal = L.Browser.svg;
const origem = "/monitoramento-equipamentos/painel?uf=GO&busca=Sa%C3%BAde#mapa";
afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
  vi.restoreAllMocks();
  Object.defineProperty(L.Browser, "svg", { value: svgOriginal });
});

function prepararMapa() {
  const h = prepararPainel();
  // Capacidades de layout, não mocks de Leaflet, hooks ou classificação.
  Object.defineProperty(L.Browser, "svg", { value: true });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(700);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
  // Scroll físico não existe no jsdom; a interação Leaflet continua real.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  h.respostas.set("/macro-coverage", {
    body: [criarMacroResposta(1), criarMacroResposta(2)],
    status: 200,
  });
  h.respostas.set("/geo/macrorregioes.geojson", {
    body: {
      type: "FeatureCollection",
      features: [1, 2].map((i) => ({
        type: "Feature",
        properties: { cod_macro: `Q${i}` },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [i * 10 - 60, -20],
              [i * 10 - 60, -10],
              [i * 10 - 50, -10],
              [i * 10 - 50, -20],
              [i * 10 - 60, -20],
            ],
          ],
        },
      })),
    },
    status: 200,
  });
  const instrumentos = [
    criarInstrumentoTeste({
      id: 1,
      nr_convenio: "QA001",
      nome_convenente: "Unidade Alfa",
      latitude: -15,
      longitude: -45,
      cnes: "0000001",
    }),
    criarInstrumentoTeste({
      id: 2,
      nr_convenio: "QA002",
      nome_convenente: "Unidade Beta",
      latitude: -15,
      longitude: -45,
      cnes: "0000002",
    }),
    criarInstrumentoTeste({
      id: 3,
      nr_convenio: "QA003",
      nome_convenente: "Unidade Gama",
      latitude: -15,
      longitude: -35,
      cnes: "0000003",
    }),
  ];
  function Tela({ itens = instrumentos }: { itens?: typeof instrumentos }) {
    return (
      <MemoryRouter initialEntries={[origem]}>
        <MonitoramentoPainelGeografia instrumentos={itens} />
      </MemoryRouter>
    );
  }
  const tela = render(<Tela />, { wrapper: h.wrapper });
  return { ...h, ...tela, instrumentos, Tela, user: userEvent.setup() };
}
async function abrirMacro(user: ReturnType<typeof userEvent.setup>) {
  const macro = await screen.findByRole("button", {
    name: "Macro sintética 1, 2 instrumentos",
  });
  act(() => macro.focus());
  await user.keyboard("{Enter}");
  return screen.findByRole("region", {
    name: "Mapa rodoviário da macrorregião Q1",
  });
}

describe("Mapas do painel com Leaflet real e fontes sintéticas", () => {
  it("substitui o mapa nacional no mesmo card e permite voltar e selecionar outra macro", async () => {
    // Given
    const { user } = prepararMapa();
    // When
    await abrirMacro(user);
    // Then
    expect(
      screen.queryByRole("group", { name: /Mapa de 2 macrorregiões/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Mapa rodoviário · Macro sintética 1",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Voltar ao mapa nacional" }),
    );
    expect(
      screen.getByRole("group", { name: /Mapa de 2 macrorregiões/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /Mapa rodoviário/ }),
    ).not.toBeInTheDocument();
    // When: a segunda macro pode ser aberta sem manter marcadores da primeira.
    const segunda = screen.getByRole("button", {
      name: "Macro sintética 2, 1 instrumento",
    });
    act(() => segunda.focus());
    await user.keyboard(" ");
    const regiao = within(
      await screen.findByRole("region", {
        name: "Mapa rodoviário da macrorregião Q2",
      }),
    );
    expect(
      regiao.queryByTitle("2 instrumentos nesta localização"),
    ).not.toBeInTheDocument();
    expect(
      regiao.getByTitle("1 instrumento nesta localização"),
    ).toBeInTheDocument();
  });

  it("remove marcador e popup obsoletos quando o filtro exclui a localização aberta", async () => {
    // Given
    const { user, rerender, Tela, instrumentos } = prepararMapa();
    const mapa = within(await abrirMacro(user));
    await user.click(mapa.getByTitle("2 instrumentos nesta localização"));
    expect(mapa.getByRole("link", { name: /QA001/ })).toBeInTheDocument();
    // When
    rerender(<Tela itens={[instrumentos[2]!]} />);
    // Then
    expect(
      screen.queryByRole("link", { name: /QA001/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTitle("2 instrumentos nesta localização"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Nenhum estabelecimento geocodificado neste recorte."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Mapa rodoviário da macrorregião Q1",
      }),
    ).toBeInTheDocument();
  });

  it("seleciona local agrupado, preserva links e fecha somente o painel de detalhe", async () => {
    // Given
    const { user } = prepararMapa();
    await screen.findByRole("button", {
      name: "Macro sintética 1, 2 instrumentos",
    });
    // When
    await user.click(
      screen.getByRole("button", { name: "2 instrumentos nesta localização" }),
    );
    await screen.findByRole("region", {
      name: "Mapa rodoviário da macrorregião Q1",
    });
    // Then
    expect(screen.getByText("Local selecionado")).toBeInTheDocument();
    for (const nome of ["Unidade Alfa", "Unidade Beta"]) {
      const link = screen.getByRole("link", { name: nome });
      expect(
        new URL(
          link.getAttribute("href")!,
          "http://sigeo.local",
        ).searchParams.get("retorno"),
      ).toBe(origem);
    }
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByText("Local selecionado")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Mapa rodoviário da macrorregião Q1",
      }),
    ).toBeInTheDocument();
  });

  it("atualiza popup do grupo e mantém conteúdo de fonte como texto, não HTML", async () => {
    // Given
    const { user, rerender, Tela, instrumentos } = prepararMapa();
    await abrirMacro(user);
    const nome = '<img src=x onerror="falha">';
    rerender(
      <Tela
        itens={[
          {
            ...instrumentos[0]!,
            nome_convenente: nome,
            equipamento_descricao: null,
            cnes: null,
            fase_atual: null,
            tecnico_titular: null,
          },
        ]}
      />,
    );
    // When
    const mapa = within(
      screen.getByRole("region", {
        name: "Mapa rodoviário da macrorregião Q1",
      }),
    );
    await user.click(mapa.getByTitle("1 instrumento nesta localização"));
    // Then
    const link = mapa.getByRole("link", { name: `QA001 · ${nome}` });
    expect(link.querySelector("img")).toBeNull();
    expect(mapa.queryByRole("link", { name: /QA002/ })).not.toBeInTheDocument();
    expect(mapa.getByText("Equipamento não informado")).toBeInTheDocument();
    expect(
      mapa.getByText("CNES não informado · Não iniciado"),
    ).toBeInTheDocument();
    expect(mapa.getByText("Técnico: Não atribuído")).toBeInTheDocument();
  });

  it("tolera remontagem em StrictMode sem inicializar dois mapas no mesmo container", async () => {
    // Given
    const { user, rerender, Tela } = prepararMapa();
    // When
    rerender(
      <StrictMode>
        <Tela />
      </StrictMode>,
    );
    const mapa = await abrirMacro(user);
    // Then
    expect(
      within(mapa).getAllByTitle("2 instrumentos nesta localização"),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Voltar ao mapa nacional" }),
    );
    expect(
      await screen.findByRole("group", { name: /Mapa de 2 macrorregiões/ }),
    ).toBeInTheDocument();
  });

  it("preserva o retorno ao painel em cada link do popup rodoviário", async () => {
    // Given
    const { user } = prepararMapa();
    const rodoviario = within(await abrirMacro(user));
    // When
    await user.click(rodoviario.getByTitle("2 instrumentos nesta localização"));
    // Then
    for (const numero of ["QA001", "QA002"]) {
      const link = rodoviario.getByRole("link", { name: new RegExp(numero) });
      const destino = new URL(link.getAttribute("href")!, "http://sigeo.local");
      expect(destino.searchParams.get("retorno")).toBe(origem);
    }
  });
});
