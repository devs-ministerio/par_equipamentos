import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NivelCoberturaRow } from "@/types/domain";
import {
  criarMacroResposta,
  criarNivelResposta,
  limparConsultasCobertura,
  prepararConsultasCobertura,
} from "@/test-fixtures/consultas-cobertura";
import { MunicipioDetalheModal } from "./municipio-detalhe-modal";

afterEach(() => {
  cleanup();
  limparConsultasCobertura();
});

function criarMunicipio(): NivelCoberturaRow {
  return {
    chave: "M1",
    nome: "Cidade sintética M1",
    uf: "BA",
    macroId: "Q1",
    macroNome: "Macro sintética 1",
    regiaoSaudeId: "RS1",
    regiaoSaudeNome: "Região sintética RS1",
    pop: 100_000,
    popResidente: 120_000,
    popAns: 20_000,
    oferta: 1,
    ofertaTotal: 99,
    cobertura: 25,
    status: "Hipossuficiente",
    distanciaKmEquipamentoMaisProximo: null,
  };
}

function prepararModal(alteracao: Partial<NivelCoberturaRow> = {}) {
  const h = prepararConsultasCobertura();
  const linha = { ...criarMunicipio(), ...alteracao };
  const onClose = vi.fn();
  h.fetch.mockImplementation(async (input) =>
    h.json(
      String(input).includes("macro-coverage")
        ? [criarMacroResposta()]
        : [criarNivelResposta("RS1")],
    ),
  );
  const tela = render(
    <MunicipioDetalheModal
      linha={linha}
      equipmentFamily="TOMOGRAFO"
      onClose={onClose}
    />,
    { wrapper: h.wrapper },
  );
  return { ...h, linha, tela, onClose };
}

function comparativo(nome: string) {
  const celula = within(screen.getByRole("dialog")).getByRole("cell", {
    name: nome,
  });
  return within(celula.closest("tr")!);
}

describe("detalhe municipal com comparativos oficiais sob demanda", () => {
  it("identifica o diálogo pelo município e associa seu contexto territorial", async () => {
    // Arrange / Act
    const h = prepararModal();
    // Assert
    const dialogo = screen.getByRole("dialog", { name: h.linha.nome });
    expect(dialogo).toHaveAccessibleDescription(
      "BA · Macro sintética 1 · Região sintética RS1",
    );
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
  });

  it("mostra loading independente dos comparativos, preservando os dados municipais", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    const respostas: ((response: Response) => void)[] = [];
    h.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          respostas.push(resolve);
        }),
    );
    // Act
    render(
      <MunicipioDetalheModal
        linha={criarMunicipio()}
        equipmentFamily="TOMOGRAFO"
        onClose={vi.fn()}
      />,
      { wrapper: h.wrapper },
    );
    expect(screen.getAllByText("Carregando...")).toHaveLength(2);
    expect(
      comparativo("Município").getByText("Hipossuficiente"),
    ).toBeInTheDocument();
    await act(async () => {
      respostas[0](h.json([criarMacroResposta()]));
    });
    // Assert
    await waitFor(() =>
      expect(screen.getAllByText("Carregando...")).toHaveLength(1),
    );
    expect(
      comparativo("Macrorregião").getByText("Hipossuficiente"),
    ).toBeInTheDocument();
    await act(async () => {
      respostas[1](h.json([criarNivelResposta("RS1")]));
    });
    await waitFor(() =>
      expect(screen.queryByText("Carregando...")).not.toBeInTheDocument(),
    );
  });

  it("seleciona a região própria, não a primeira resposta, e mantém o status da fonte", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    h.fetch.mockImplementation(async (input) =>
      h.json(
        String(input).includes("macro-coverage")
          ? [criarMacroResposta(1, "not_available")]
          : [
              criarNivelResposta("OUTRA", "deficient"),
              criarNivelResposta("RS1", "not_deficient"),
            ],
      ),
    );
    // Act
    render(
      <MunicipioDetalheModal
        linha={criarMunicipio()}
        equipmentFamily="TOMOGRAFO"
        onClose={vi.fn()}
      />,
      { wrapper: h.wrapper },
    );
    // Assert
    await waitFor(() =>
      expect(
        comparativo("Região de saúde").getByText("Hiperssuficiente"),
      ).toBeInTheDocument(),
    );
    expect(
      comparativo("Macrorregião").getByText("Dados indisponíveis"),
    ).toBeInTheDocument();
    expect(screen.getByText(/99 no total/)).toBeInTheDocument();
    for (const [input] of h.fetch.mock.calls) {
      const url = new URL(String(input));
      expect(url.searchParams.get("equipment_family")).toBe("TOMOGRAFO");
      expect(url.searchParams.get("macro_code")).toBe("Q1");
    }
  });

  it.each(["http", "schema", "vazio", "região ausente"])(
    "trata comparativos %s sem zerar ou inventar o status municipal",
    async (cenario) => {
      // Arrange
      const h = prepararConsultasCobertura();
      h.fetch.mockImplementation(async (input) =>
        cenario === "http"
          ? h.json({ detail: "diagnóstico reservado" }, 503)
          : cenario === "schema"
            ? h.json([{ segredo: "diagnóstico reservado" }])
            : cenario === "região ausente" &&
                String(input).includes("macro-coverage")
              ? h.json([criarMacroResposta()])
              : h.json(
                  cenario === "vazio" ? [] : [criarNivelResposta("OUTRA")],
                ),
      );
      // Act
      render(
        <MunicipioDetalheModal
          linha={criarMunicipio()}
          equipmentFamily="TOMOGRAFO"
          onClose={vi.fn()}
        />,
        { wrapper: h.wrapper },
      );
      // Assert
      await waitFor(() =>
        expect(
          comparativo("Região de saúde").getByText("Não disponível"),
        ).toBeInTheDocument(),
      );
      if (cenario !== "região ausente")
        expect(
          comparativo("Macrorregião").getByText("Não disponível"),
        ).toBeInTheDocument();
      expect(
        comparativo("Município").getByText("Hipossuficiente"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/diagnóstico reservado/),
      ).not.toBeInTheDocument();
    },
  );

  it("não consulta comparativos sem vínculo de macrorregião", () => {
    // Arrange / Act
    const h = prepararModal({
      macroId: null,
      macroNome: null,
      regiaoSaudeId: null,
      regiaoSaudeNome: null,
    });
    // Assert
    expect(h.fetch).not.toHaveBeenCalled();
    expect(screen.getAllByText("Não disponível")).toHaveLength(2);
    expect(screen.getByText(/Macrorregião não informada/)).toBeInTheDocument();
    expect(
      screen.getByText(/Região de saúde não informada/),
    ).toBeInTheDocument();
  });

  it.each([
    [75, "dentro"],
    [76, "fora"],
  ] as const)(
    "exibe distância informativa de %s km sem reclassificar o município",
    async (distancia, posicao) => {
      // Arrange / Act
      const h = prepararModal({ distanciaKmEquipamentoMaisProximo: distancia });
      // Assert
      expect(
        screen.getByText(new RegExp(`${posicao} do raio de 75 km`)),
      ).toBeInTheDocument();
      expect(
        comparativo("Município").getByText("Hipossuficiente"),
      ).toBeInTheDocument();
      await waitFor(() => expect(h.client.isFetching()).toBe(0));
    },
  );

  it("não exibe distância desconhecida nem total redundante", async () => {
    // Arrange / Act
    const h = prepararModal({ ofertaTotal: 1 });
    // Assert
    expect(screen.queryByText(/raio de 75 km/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no total/)).not.toBeInTheDocument();
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
  });

  it.each(["botão", "ícone", "escape"])(
    "permite fechar por %s",
    async (forma) => {
      // Arrange
      const h = prepararModal();
      await waitFor(() => expect(h.client.isFetching()).toBe(0));
      // Act
      if (forma === "escape")
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      else
        fireEvent.click(
          screen.getAllByRole("button", { name: "Fechar" })[
            forma === "ícone" ? 0 : 1
          ],
        );
      // Assert
      expect(h.onClose).toHaveBeenCalledTimes(1);
    },
  );

  it("isola comparativos atrasados de outra macro e família", async () => {
    // Arrange
    const h = prepararConsultasCobertura();
    const pendentes: ((response: Response) => void)[] = [];
    h.fetch.mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("equipment_family") === "TOMOGRAFO")
        return new Promise((resolve) => {
          pendentes.push(resolve);
        });
      return Promise.resolve(
        h.json(
          url.pathname.includes("macro-coverage")
            ? [criarMacroResposta(2, "not_deficient")]
            : [criarNivelResposta("RS2", "not_deficient")],
        ),
      );
    });
    const tela = render(
      <MunicipioDetalheModal
        linha={criarMunicipio()}
        equipmentFamily="TOMOGRAFO"
        onClose={vi.fn()}
      />,
      { wrapper: h.wrapper },
    );
    // Act
    tela.rerender(
      <MunicipioDetalheModal
        linha={{
          ...criarMunicipio(),
          nome: "Cidade atual",
          macroId: "Q2",
          regiaoSaudeId: "RS2",
        }}
        equipmentFamily="RESSONANCIA"
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        comparativo("Macrorregião").getByText("Hiperssuficiente"),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      pendentes[0](h.json([criarMacroResposta()]));
      pendentes[1](h.json([criarNivelResposta("RS1")]));
    });
    await waitFor(() => expect(h.client.isFetching()).toBe(0));
    // Assert
    expect(
      comparativo("Macrorregião").getByText("Hiperssuficiente"),
    ).toBeInTheDocument();
    expect(
      comparativo("Região de saúde").getByText("Hiperssuficiente"),
    ).toBeInTheDocument();
    expect(screen.getByText("Cidade atual")).toBeInTheDocument();
  });
});
