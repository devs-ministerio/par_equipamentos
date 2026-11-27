import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useDadosOficiaisFiltros } from "@/hooks/use-dados-oficiais-filtros";
import { DadosOficiaisFiltros } from "./dados-oficiais-filtros";

const opcoes = {
  tipoContratacao: [{ value: "FAF", label: "FAF" }],
  uf: [
    { value: "BA", label: "BA" },
    { value: "SP", label: "SP" },
  ],
  municipio: [],
  cnes: [],
  equipamento: [],
  situacao: [{ value: "Concluído", label: "Concluído" }],
  programa: [],
  ano: [
    { value: "2025", label: "2025" },
    { value: "2026", label: "2026" },
  ],
};

function Conteudo() {
  const filtros = useDadosOficiaisFiltros();
  const location = useLocation();
  return (
    <>
      <DadosOficiaisFiltros filtros={filtros} opcoes={opcoes} />
      <output aria-label="URL">{location.search}</output>
    </>
  );
}
function montar(query = "") {
  render(
    <MemoryRouter initialEntries={[`/monitoramento-equipamentos?${query}`]}>
      <Conteudo />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("Filtros de Dados oficiais no padrão de popovers", () => {
  it("aceita mais de uma UF, mostra a etiqueta e limpa tudo", async () => {
    const user = montar("origem=teste");
    await user.click(screen.getByRole("button", { name: "UF" }));
    const grupo = within(screen.getByRole("group", { name: "UF" }));
    await user.click(grupo.getByRole("button", { name: "BA" }));
    await user.click(grupo.getByRole("button", { name: "SP" }));
    expect(screen.getByLabelText("URL")).toHaveTextContent("uf=BA&uf=SP");
    expect(
      screen.getByRole("button", { name: "Remover filtro UF: BA, SP" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByLabelText("URL")).toHaveTextContent("?origem=teste");
  });

  it("mantém Etapa, Situação e período entre os filtros", async () => {
    const user = montar("monitorado=sim&ano_inicio=2025");
    expect(
      screen.getByRole("button", {
        name: "Remover filtro Etapa: Em monitoramento",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remover filtro Período: 2025 – …" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Situação" }));
    await user.click(
      within(screen.getByRole("group", { name: "Situação" })).getByRole(
        "button",
        { name: "Concluído" },
      ),
    );
    expect(screen.getByLabelText("URL")).toHaveTextContent("situacao=Conclu");
  });
});
