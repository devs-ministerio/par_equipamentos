import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  useMonitoramentoInternoFiltros,
  type InstrumentoMonitoramentoFiltravel,
} from "@/hooks/use-monitoramento-interno-filtros";
import { MonitoramentoInternoFiltros } from "./monitoramento-interno-filtros";
import { criarMarcadorTeste } from "@/test-fixtures/dados-oficiais";

const carteira: InstrumentoMonitoramentoFiltravel[] = [2025, 2026].map(
  (ano, indice) => ({
    nr_convenio: `sintetico-${indice}`,
    nome_convenente: `Hospital Sintético ${indice}`,
    cnes: `teste-${indice}`,
    municipio: indice ? "Cidade Beta" : "Cidade Alfa",
    uf: indice ? "BA" : "AL",
    tipo_contratacao: indice ? "TED" : "Convênio",
    fase_atual: indice ? "Concluído" : "Não iniciado",
    situacao_prestacao_contas: null,
    tecnico_titular: null,
    equipamento_descricao: indice ? "Cadeira hospitalar" : "Mamógrafo",
    programa: indice ? "Programa Beta" : "Programa Alfa",
    ano_instrumento: ano,
  }),
);

function Conteudo({
  itens = carteira,
}: {
  itens?: InstrumentoMonitoramentoFiltravel[];
}) {
  const fontes = itens.map((item, i) => ({
    numero: item.nr_convenio,
    equipamentos: [
      criarMarcadorTeste(i ? "Cadeira hospitalar" : "Mamógrafo", !i),
    ],
  }));
  const filtros = useMonitoramentoInternoFiltros(itens, fontes);
  const location = useLocation();
  return (
    <>
      <MonitoramentoInternoFiltros filtros={filtros} />
      <output aria-label="URL">{location.search}</output>
      <output aria-label="Resultados">
        {filtros.filtrados.map((item) => item.nr_convenio).join(",")}
      </output>
    </>
  );
}
function montar(query = "") {
  render(
    <MemoryRouter
      initialEntries={[`/monitoramento-equipamentos/painel?${query}`]}
    >
      <Conteudo />
    </MemoryRouter>,
  );
  return userEvent.setup();
}
async function selecionar(
  user: ReturnType<typeof userEvent.setup>,
  campo: string,
  opcao: string,
) {
  await user.click(screen.getByRole("button", { name: new RegExp(campo) }));
  await user.click(screen.getByRole("option", { name: opcao }));
}

describe("Filtros reais do monitoramento e URL", () => {
  it("exibe município capitalizado na opção e na seleção de uma URL antiga", async () => {
    // Given: fonte em minúsculas e uma URL anterior com caixa diferente.
    const itens = carteira.map((item) => ({ ...item, municipio: "anápolis" }));
    render(
      <MemoryRouter initialEntries={["/?municipio=ANÁPOLIS"]}>
        <Conteudo itens={itens} />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    // When
    await user.click(screen.getByRole("button", { name: /^Anápolis/ }));
    // Then: valor normalizado não vaza como rótulo em minúsculas.
    expect(
      screen.getByRole("option", { name: "Anápolis" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Anápolis" }));
    expect(
      screen.getByRole("button", { name: /^Anápolis/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 de 2 instrumentos")).toBeInTheDocument();
  });

  it("preserva espaços durante a digitação de uma busca com várias palavras", async () => {
    // Given: campo controlado pela URL, sem setters simulados.
    const user = montar("pagina=3&origem=teste");
    const busca = screen.getByRole("textbox", {
      name: "Buscar número, convenente, CNES ou município",
    });
    // When: digitação incremental inclui um espaço entre palavras.
    await user.type(busca, "Hospital Sintético");
    // Then: busca, resultados e URL permanecem coerentes.
    expect(busca).toHaveValue("Hospital Sintético");
    expect(screen.getByText("2 de 2 instrumentos")).toBeInTheDocument();
    expect(screen.getByLabelText("URL")).not.toHaveTextContent("pagina=");
    expect(screen.getByLabelText("URL")).toHaveTextContent("origem=teste");
  });

  it.each([
    ["Tipo de contratação", "TED", "sintetico-1"],
    ["CNES", "teste-0", "sintetico-0"],
    ["UF", "BA", "sintetico-1"],
    ["Município", "Cidade Alfa", "sintetico-0"],
    ["Equipamento", "Mamógrafo", "sintetico-0"],
    ["Situação", "Concluído", "sintetico-1"],
    ["Programas", "Programa Beta", "sintetico-1"],
  ])(
    "aplica %s e limpa o recorte sem apagar parâmetros externos",
    async (campo, opcao, numero) => {
      // Given
      const user = montar("pagina=4&origem=teste");
      // When
      await selecionar(user, campo, opcao);
      // Then
      expect(screen.getByLabelText("Resultados")).toHaveTextContent(numero);
      expect(screen.getByText("1 de 2 instrumentos")).toBeInTheDocument();
      expect(screen.getByLabelText("URL")).not.toHaveTextContent("pagina=");
      await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
      expect(screen.getByLabelText("URL")).toHaveTextContent("?origem=teste");
      expect(screen.getByText("2 de 2 instrumentos")).toBeInTheDocument();
    },
  );

  it("combina filtros e apresenta recorte vazio sem reutilizar resultados anteriores", async () => {
    // Given
    const user = montar();
    // When
    await selecionar(user, "UF", "BA");
    await selecionar(user, "Tipo de contratação", "Convênio");
    // Then
    expect(screen.getByText("0 de 2 instrumentos")).toBeInTheDocument();
    expect(screen.getByLabelText("Resultados")).toBeEmptyDOMElement();
  });

  it.each([
    [
      "ano_fim=2025",
      "… — 2025",
      "Ano início",
      "2026",
      "ano_inicio=2026",
      "ano_fim=",
      "sintetico-1",
    ],
    [
      "ano_inicio=2026",
      "2026 — …",
      "Ano fim",
      "2025",
      "ano_fim=2025",
      "ano_inicio=",
      "sintetico-0",
    ],
  ])(
    "substitui intervalo incompatível %s sem perder o ano escolhido",
    async (query, rotulo, campo, ano, presente, ausente, numero) => {
      // Given
      const user = montar(`${query}&origem=teste&pagina=3`);
      // When
      await user.click(
        screen.getByRole("button", { name: new RegExp(rotulo) }),
      );
      await selecionar(user, campo, ano);
      // Then
      expect(screen.getByLabelText("URL")).toHaveTextContent(presente);
      expect(screen.getByLabelText("URL")).not.toHaveTextContent(ausente);
      expect(screen.getByLabelText("URL")).toHaveTextContent("origem=teste");
      expect(screen.getByLabelText("URL")).not.toHaveTextContent("pagina=");
      expect(screen.getByLabelText("Resultados")).toHaveTextContent(numero);
    },
  );

  it("mantém o limite compatível e permite limpar apenas um ano", async () => {
    // Given
    const user = montar("ano_fim=2026");
    // When
    await user.click(screen.getByRole("button", { name: /… — 2026/ }));
    await selecionar(user, "Ano início", "2025");
    // Then
    expect(screen.getByLabelText("URL")).toHaveTextContent("ano_inicio=2025");
    expect(screen.getByLabelText("URL")).toHaveTextContent("ano_fim=2026");
    await selecionar(user, "^2025▾$", "Ano início");
    expect(screen.getByLabelText("URL")).not.toHaveTextContent("ano_inicio=");
    expect(screen.getByLabelText("URL")).toHaveTextContent("ano_fim=2026");
  });

  it("troca a classe de opções e remove a seleção de equipamento anterior", async () => {
    // Given
    const user = montar("equipamento=Mamógrafo");
    // When
    await selecionar(user, "Todos", "Outros identificados");
    await user.click(screen.getByRole("button", { name: /^Equipamento/ }));
    // Then
    expect(
      screen.queryByRole("option", { name: "Mamógrafo" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("option", { name: "Cadeira hospitalar" }),
    );
    expect(screen.getByLabelText("Resultados")).toHaveTextContent(
      "sintetico-1",
    );
  });
});
