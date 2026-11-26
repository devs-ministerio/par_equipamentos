import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useGerarRelatorio } from "@/hooks/use-gerar-relatorio";
import { consultarPreviaRelatorio } from "@/services/relatorios-previa";
import {
  parametrosRelatorio,
  type FiltroRelatorio,
} from "@/services/relatorios";
import { RelatorioExportacaoCarteira } from "./relatorio-exportacao-carteira";

vi.mock("@/hooks/use-gerar-relatorio");
vi.mock("@/services/relatorios-previa", { spy: true });

afterEach(cleanup);

function abrirPagina(filtro: FiltroRelatorio) {
  const gerar = vi.fn();
  vi.mocked(useGerarRelatorio).mockReturnValue({
    gerar,
    gerando: null,
    erro: null,
  });
  const previa = vi.mocked(consultarPreviaRelatorio).mockResolvedValue({
    colunas: [],
    linhas: [],
    total: 0,
    total_linhas: 0,
    unidade: "unidades",
  });
  previa.mockClear();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RelatorioExportacaoCarteira
        filtro={filtro}
        recortes={[{ rotulo: "UF", valor: "Bahia" }]}
        escopo="Bahia"
      />
    </QueryClientProvider>,
  );
  return {
    user: userEvent.setup(),
    seletor: screen.getByRole("button", { name: "Tipo de relatório" }),
    configurar: screen.getByRole("button", { name: "Configurar" }),
    previa,
    gerar,
  };
}

it("só abre a exportação após confirmar o tipo compatível e devolve o foco ao cancelar", async () => {
  const { user, seletor, configurar, previa, gerar } = abrirPagina({
    escopo: "uf",
    uf: "BA",
    etapa: "propostas",
  });

  expect(configurar).toBeDisabled();
  await user.click(seletor);
  const tipos = within(
    screen.getByRole("group", { name: "Tipo de relatório" }),
  );
  expect(
    tipos.getAllByRole("button").map((botao) => botao.textContent),
  ).toEqual(["Propostas", "Instrumentos", "Equipamentos"]);
  expect(tipos.getByRole("button", { name: "Equipamentos" })).toBeDisabled();
  expect(tipos.getByRole("button", { name: "Instrumentos" })).toBeDisabled();
  await user.click(tipos.getByRole("button", { name: "Propostas" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Baixar Word" }),
  ).not.toBeInTheDocument();

  await user.click(configurar);
  const dialogo = within(screen.getByRole("dialog", { name: "Propostas" }));
  expect(dialogo.getByText("UF: Bahia")).toBeInTheDocument();
  expect(dialogo.getByRole("button", { name: "Simplificado" })).toBeDisabled();
  expect(dialogo.getByRole("button", { name: "Completo" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await waitFor(() =>
    expect(dialogo.getByRole("button", { name: "Baixar Word" })).toBeEnabled(),
  );
  expect(dialogo.getByRole("button", { name: "Baixar Excel" })).toBeEnabled();
  expect(previa).toHaveBeenLastCalledWith(
    "propostas",
    "completo",
    { escopo: "uf", uf: "BA", etapa: "propostas" },
    1,
    expect.anything(),
  );
  await user.click(dialogo.getByRole("button", { name: "Baixar Word" }));
  expect(gerar).toHaveBeenCalledWith("docx", "completo", {
    escopo: "uf",
    uf: "BA",
    etapa: "propostas",
  });
  await user.click(dialogo.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(configurar).toHaveFocus());
  expect(seletor).toHaveTextContent("Propostas");
});

it("preserva a fase principal na prévia e na exportação de equipamentos e descarta ajustes ao cancelar", async () => {
  const filtro: FiltroRelatorio = {
    escopo: "uf",
    uf: "BA",
    etapa: "monitorado",
    situacao: "Concluído",
    situacaoOrigem: "monitoramento",
  };
  const { user, seletor, configurar, previa, gerar } = abrirPagina(filtro);
  await user.click(seletor);
  await user.click(screen.getByRole("button", { name: "Equipamentos" }));
  await user.click(configurar);

  const dialogo = within(screen.getByRole("dialog", { name: "Equipamentos" }));
  const situacoes = within(
    dialogo.getByRole("group", { name: "Situação do equipamento" }),
  );
  const todas = situacoes.getByRole("checkbox", { name: "Selecionar todos" });
  expect(todas).toBeChecked();
  await user.click(todas);
  expect(
    dialogo.getByText("Selecione uma situação para ver a prévia."),
  ).toBeInTheDocument();
  expect(dialogo.getByRole("button", { name: "Baixar Excel" })).toBeDisabled();
  await user.click(situacoes.getByRole("checkbox", { name: "Em operação" }));
  expect(todas).toBePartiallyChecked();
  await user.click(dialogo.getByRole("button", { name: "Completo" }));
  const recorte = { ...filtro, situacoesEquipamento: ["em_operacao"] };
  await waitFor(() =>
    expect(previa).toHaveBeenLastCalledWith(
      "equipamentos_monitorados",
      "completo",
      recorte,
      1,
      expect.anything(),
    ),
  );
  const excel = dialogo.getByRole("button", { name: "Baixar Excel" });
  await waitFor(() => expect(excel).toBeEnabled());
  await user.click(excel);
  expect(gerar).toHaveBeenCalledWith("xlsx", "completo", recorte);

  await user.click(dialogo.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(configurar).toHaveFocus());
  await user.click(configurar);
  const reaberto = within(screen.getByRole("dialog", { name: "Equipamentos" }));
  expect(
    reaberto.getByRole("checkbox", { name: "Selecionar todos" }),
  ).toBeChecked();
  expect(
    reaberto.getByRole("button", { name: "Simplificado" }),
  ).toHaveAttribute("aria-pressed", "true");
});

it("aplica várias fases à prévia e à exportação de instrumentos", async () => {
  const filtro: FiltroRelatorio = { escopo: "brasil" };
  const { user, seletor, configurar, previa, gerar } = abrirPagina(filtro);
  await user.click(seletor);
  await user.click(screen.getByRole("button", { name: "Instrumentos" }));
  await user.click(configurar);

  const dialogo = within(screen.getByRole("dialog", { name: "Instrumentos" }));
  expect(dialogo.getByRole("button", { name: "Simplificado" })).toBeDisabled();
  expect(dialogo.getByRole("button", { name: "Completo" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const fases = within(
    dialogo.getByRole("group", { name: "Fase do monitoramento" }),
  );
  const todas = fases.getByRole("checkbox", { name: "Selecionar todos" });
  expect(todas).toBeChecked();
  await user.click(todas);
  expect(
    dialogo.getByText("Selecione uma fase para ver a prévia."),
  ).toBeInTheDocument();
  await user.click(fases.getByRole("checkbox", { name: "Em aquisição" }));
  await user.click(fases.getByRole("checkbox", { name: "Concluído" }));
  expect(fases.getByRole("checkbox", { name: "Em aquisição" })).toBeChecked();
  expect(fases.getByRole("checkbox", { name: "Concluído" })).toBeChecked();
  expect(todas).toBePartiallyChecked();

  const recorte: FiltroRelatorio = {
    ...filtro,
    fasesInstrumento: ["Em aquisição", "Concluído"],
  };
  await waitFor(() =>
    expect(previa).toHaveBeenLastCalledWith(
      "instrumentos_monitorados",
      "completo",
      recorte,
      1,
      expect.anything(),
    ),
  );
  const excel = dialogo.getByRole("button", { name: "Baixar Excel" });
  await waitFor(() => expect(excel).toBeEnabled());
  await user.click(excel);
  expect(gerar).toHaveBeenCalledWith("xlsx", "completo", recorte);
  expect(
    parametrosRelatorio(
      "instrumentos_monitorados",
      "completo",
      recorte,
    ).getAll("fase_instrumento"),
  ).toEqual(["Em aquisição", "Concluído"]);
});
