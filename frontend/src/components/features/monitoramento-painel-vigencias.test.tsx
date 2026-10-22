import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { MonitoramentoInstrumentoPage } from "@/pages/monitoramento-instrumento-page";
import { prepararOrquestracao } from "@/test-fixtures/monitoramento-orquestracao";
import { limparMonitoramentoHttp } from "@/test-fixtures/monitoramento-hooks";
import { MonitoramentoPainelVigencias } from "./monitoramento-painel-vigencias";

const vigencias = [
  {
    nr_convenio: "QA001",
    nome_convenente: "Unidade Alfa sintética",
    data_final: "2026-10-20",
    dias: 0,
  },
  {
    nr_convenio: "QA002",
    nome_convenente: "Unidade Beta sintética",
    data_final: "2027-01-18",
    dias: 90,
  },
];
const origem =
  "/monitoramento-equipamentos/painel?uf=GO&municipio=anapolis&busca=Sa%C3%BAde&pagina=3#prazos";
function LocalAtual() {
  const local = useLocation();
  return (
    <output aria-label="URL atual">
      {local.pathname}
      {local.search}
      {local.hash}
    </output>
  );
}
function Conteudo({ itens = vigencias }: { itens?: typeof vigencias }) {
  return (
    <>
      <MonitoramentoPainelVigencias vigencias={itens} />
      <LocalAtual />
    </>
  );
}
function montar(itens = vigencias) {
  const tela = render(
    <MemoryRouter initialEntries={[origem]}>
      <Conteudo itens={itens} />
    </MemoryRouter>,
  );
  return { ...tela, user: userEvent.setup() };
}
async function abrir(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", {
      name: /Instrumentos com vigência a encerrar/,
    }),
  );
  return screen.getByRole("dialog", { name: "Vigências a encerrar" });
}

afterEach(() => {
  cleanup();
  limparMonitoramentoHttp();
});

describe("Vigências do painel e navegação real", () => {
  it("apresenta hoje e o limite de 90 dias com datas e identificação completas", async () => {
    // Given
    const { user } = montar();
    // When
    const dialog = within(await abrir(user));
    // Then
    expect(dialog.getByText("20/10/2026 · vence hoje")).toBeInTheDocument();
    expect(dialog.getByText("18/01/2027 · em 90 dias")).toBeInTheDocument();
    expect(dialog.getAllByRole("link")).toHaveLength(2);
    expect(dialog.getByText(/2 instrumentos com prazo/)).toBeInTheDocument();
    expect(dialog.getByRole("link", { name: /Unidade Alfa/ })).toHaveAttribute(
      "href",
      expect.stringContaining("retorno="),
    );
  });

  it("atualiza a janela já aberta sem reter registros de outro recorte", async () => {
    // Given
    const { user, rerender } = montar();
    await abrir(user);
    // When: simula nova lista recebida pelo mesmo componente.
    rerender(
      <MemoryRouter initialEntries={[origem]}>
        <Conteudo itens={[vigencias[1]!]} />
      </MemoryRouter>,
    );
    // Then
    const dialog = within(screen.getByRole("dialog"));
    expect(
      dialog.queryByRole("link", { name: /Unidade Alfa/ }),
    ).not.toBeInTheDocument();
    expect(dialog.getAllByRole("link")).toHaveLength(1);
    expect(dialog.getByText(/1 instrumentos com prazo/)).toBeInTheDocument();
    rerender(
      <MemoryRouter initialEntries={[origem]}>
        <Conteudo itens={[]} />
      </MemoryRouter>,
    );
    expect(dialog.queryAllByRole("link")).toHaveLength(0);
    expect(
      dialog.getByText(/Nenhuma vigência com encerramento/),
    ).toBeInTheDocument();
  });

  it("fecha por Escape e devolve foco ao card sem mudar a URL", async () => {
    // Given
    const { user } = montar();
    const trigger = screen.getByRole("button", {
      name: /Instrumentos com vigência a encerrar/,
    });
    await abrir(user);
    // When
    await user.keyboard("{Escape}");
    // Then
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByLabelText("URL atual")).toHaveTextContent(origem);
  });

  it("codifica o identificador e conserva recorte/acentos/página/hash no retorno", async () => {
    // Given: identificador sintético, sem reinterpretar formato do backend.
    const { user } = montar([{ ...vigencias[0]!, nr_convenio: "QA 01&teste" }]);
    const dialog = within(await abrir(user));
    const link = dialog.getByRole("link", { name: /Unidade Alfa/ });
    // When
    const url = new URL(link.getAttribute("href")!, "http://sigeo.local");
    await user.click(link);
    // Then
    expect(url.pathname).toBe(
      "/monitoramento-equipamentos/instrumentos/QA%2001%26teste",
    );
    expect(url.searchParams.get("retorno")).toBe(origem);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("URL atual")).toHaveTextContent(
      url.pathname + url.search,
    );
  });

  it("não propaga origem externa ou página desconhecida como retorno", async () => {
    // Given
    render(
      <MemoryRouter
        initialEntries={["/rota-desconhecida?retorno=https://externo.example/"]}
      >
        <Conteudo />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    // When
    const dialog = within(await abrir(user));
    // Then
    expect(dialog.getByRole("link", { name: /Unidade Alfa/ })).toHaveAttribute(
      "href",
      "/monitoramento-equipamentos/instrumentos/QA001",
    );
  });

  it("abre o detalhe verdadeiro e volta ao painel mantendo o recorte", async () => {
    // Given: HTTP sintético; páginas, componentes, hooks e schemas reais.
    const h = prepararOrquestracao();
    render(
      <MemoryRouter initialEntries={[origem]}>
        <Routes>
          <Route
            path="/monitoramento-equipamentos/painel"
            element={<Conteudo />}
          />
          <Route
            path="/monitoramento-equipamentos/instrumentos/:nrConvenio"
            element={<MonitoramentoInstrumentoPage />}
          />
        </Routes>
      </MemoryRouter>,
      { wrapper: h.wrapper },
    );
    const user = userEvent.setup();
    const dialog = within(await abrir(user));
    // When: navegação acessível pelo teclado.
    dialog.getByRole("link", { name: /Unidade Alfa/ }).focus();
    await user.keyboard("{Enter}");
    // Then: detalhe carregado por HTTP realista, não por mock de filho.
    expect(
      await screen.findByRole("heading", { name: "QA001", level: 1 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Editar cadastro" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "Voltar para Painel de gestão" }),
    );
    expect(screen.getByLabelText("URL atual")).toHaveTextContent(origem);
    expect(
      screen.getByRole("button", {
        name: /Instrumentos com vigência a encerrar/,
      }),
    ).toBeInTheDocument();
    expect(
      h.fetch.mock.calls.some(([url]) =>
        String(url).includes("/monitoramento/instrumentos/QA001"),
      ),
    ).toBe(true);
  });
});
