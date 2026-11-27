import { render, screen, within } from "@testing-library/react";
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
type Usuario = ReturnType<typeof userEvent.setup>;

async function abrir(user: Usuario, filtro: string) {
  await user.click(screen.getByRole("button", { name: filtro }));
}
/** Abre o filtro e escolhe uma opção da lista (o popover fecha ao escolher). */
async function escolher(
  user: Usuario,
  filtro: string,
  grupo: string,
  opcao: string,
) {
  await abrir(user, filtro);
  await user.click(
    within(screen.getByRole("group", { name: grupo })).getByRole("button", {
      name: opcao,
    }),
  );
}
async function escolherUf(user: Usuario, uf: string) {
  await abrir(user, "UF / Município");
  await user.selectOptions(screen.getByRole("combobox", { name: "UF" }), uf);
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
    // Then: a etiqueta do filtro ativo usa a grafia exibida.
    expect(
      screen.getByRole("button", {
        name: "Remover filtro Município: Anápolis",
      }),
    ).toBeInTheDocument();
    // When
    await abrir(user, "UF / Município");
    // Then: valor normalizado não vaza como rótulo em minúsculas.
    expect(
      within(screen.getByRole("group", { name: "Município" })).getByRole(
        "button",
        { name: "Anápolis", pressed: true },
      ),
    ).toBeInTheDocument();
  });

  it("preserva espaços durante a digitação de uma busca com várias palavras", async () => {
    // Given: campo controlado pela URL, sem setters simulados.
    const user = montar("pagina=3&origem=teste");
    await abrir(user, "Busca");
    const busca = screen.getByRole("searchbox", { name: "Buscar instrumento" });
    // When: digitação incremental inclui um espaço entre palavras.
    await user.type(busca, "Hospital Sintético");
    // Then: busca, resultados e URL permanecem coerentes.
    expect(busca).toHaveValue("Hospital Sintético");
    expect(screen.getByLabelText("Resultados")).toHaveTextContent(
      "sintetico-0,sintetico-1",
    );
    expect(screen.getByLabelText("URL")).not.toHaveTextContent("pagina=");
    expect(screen.getByLabelText("URL")).toHaveTextContent("origem=teste");
  });

  it.each([
    ["Contratação", "Contratação", "TED", "sintetico-1"],
    ["CNES", "CNES", "teste-0", "sintetico-0"],
    ["Equipamento", "Equipamento", "Mamógrafo", "sintetico-0"],
    ["Situação", "Situação", "Concluído", "sintetico-1"],
    ["Programas", "Programas", "Programa Beta", "sintetico-1"],
  ])(
    "aplica %s e limpa o recorte sem apagar parâmetros externos",
    async (filtro, grupo, opcao, numero) => {
      // Given
      const user = montar("pagina=4&origem=teste");
      // When
      await escolher(user, filtro, grupo, opcao);
      // Then
      expect(screen.getByLabelText("Resultados")).toHaveTextContent(numero);
      expect(screen.getByLabelText("Resultados")).not.toHaveTextContent(",");
      expect(screen.getByLabelText("URL")).not.toHaveTextContent("pagina=");
      await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
      expect(screen.getByLabelText("URL")).toHaveTextContent("?origem=teste");
      expect(screen.getByLabelText("Resultados")).toHaveTextContent(
        "sintetico-0,sintetico-1",
      );
    },
  );

  it("aplica UF e Município no mesmo filtro", async () => {
    // Given
    const user = montar("origem=teste");
    // When
    await escolherUf(user, "BA");
    // Then
    expect(screen.getByLabelText("Resultados")).toHaveTextContent(
      "sintetico-1",
    );
    // When
    await user.click(
      within(screen.getByRole("group", { name: "Município" })).getByRole(
        "button",
        { name: "Cidade Beta" },
      ),
    );
    // Then
    expect(screen.getByLabelText("URL")).toHaveTextContent("uf=BA");
    expect(screen.getByLabelText("URL")).toHaveTextContent("municipio=");
    expect(screen.getByLabelText("Resultados")).toHaveTextContent(
      "sintetico-1",
    );
  });

  it("combina filtros e apresenta recorte vazio sem reutilizar resultados anteriores", async () => {
    // Given
    const user = montar();
    // When
    await escolherUf(user, "BA");
    await escolher(user, "Contratação", "Contratação", "Convênio");
    // Then
    expect(screen.getByLabelText("Resultados")).toBeEmptyDOMElement();
  });

  it("oferece apenas anos compatíveis com o outro limite do período", async () => {
    // Given
    const user = montar("ano_fim=2025&origem=teste&pagina=3");
    // When
    await abrir(user, "Período");
    // Then: o ano inicial não passa do final.
    const inicial = screen.getByRole("combobox", { name: "Ano inicial" });
    expect(
      within(inicial).queryByRole("option", { name: "2026" }),
    ).not.toBeInTheDocument();
    expect(
      within(inicial).getByRole("option", { name: "2025" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Resultados")).toHaveTextContent(
      "sintetico-0",
    );
  });

  it("mantém o limite compatível e permite limpar apenas um ano", async () => {
    // Given
    const user = montar("ano_fim=2026");
    // When
    await abrir(user, "Período");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Ano inicial" }),
      "2025",
    );
    // Then
    expect(screen.getByLabelText("URL")).toHaveTextContent("ano_inicio=2025");
    expect(screen.getByLabelText("URL")).toHaveTextContent("ano_fim=2026");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Ano inicial" }),
      "",
    );
    expect(screen.getByLabelText("URL")).not.toHaveTextContent("ano_inicio=");
    expect(screen.getByLabelText("URL")).toHaveTextContent("ano_fim=2026");
  });

  it("troca a classe de opções e remove a seleção de equipamento anterior", async () => {
    // Given
    const user = montar("equipamento=Mamógrafo");
    // When
    await abrir(user, "Equipamento");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Mostrar na lista" }),
      "outro",
    );
    // Then
    const grupo = within(screen.getByRole("group", { name: "Equipamento" }));
    expect(
      grupo.queryByRole("button", { name: "Mamógrafo" }),
    ).not.toBeInTheDocument();
    await user.click(grupo.getByRole("button", { name: "Cadeira hospitalar" }));
    expect(screen.getByLabelText("Resultados")).toHaveTextContent(
      "sintetico-1",
    );
  });

  it.each([
    ["outro", "sintetico-1"],
    ["prioritario", "sintetico-0"],
  ])(
    "a lista %s restringe os instrumentos, não só as opções de equipamento",
    async (classe, numero) => {
      // Given
      const user = montar("origem=teste");
      // When
      await abrir(user, "Equipamento");
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Mostrar na lista" }),
        classe,
      );
      // Then
      expect(screen.getByLabelText("Resultados")).toHaveTextContent(numero);
      expect(screen.getByLabelText("Resultados")).not.toHaveTextContent(",");
      expect(screen.getByLabelText("URL")).toHaveTextContent(
        `classe=${classe}`,
      );
    },
  );
});
