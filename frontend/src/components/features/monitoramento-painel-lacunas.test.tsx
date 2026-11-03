import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MonitoramentoPainelLacunas } from "./monitoramento-painel-lacunas";

function renderizar(
  lacunas: Parameters<typeof MonitoramentoPainelLacunas>[0]["lacunas"],
) {
  render(
    <MemoryRouter>
      <MonitoramentoPainelLacunas lacunas={lacunas} />
    </MemoryRouter>,
  );
}

describe("MonitoramentoPainelLacunas", () => {
  it("separa as três lacunas, com contagem e acesso ao detalhe", () => {
    renderizar([
      {
        nr_convenio: "25000185040202348",
        nome_convenente: "Hospital de Clínicas",
        tipo: "concluido_sem_data_conclusao",
      },
      {
        nr_convenio: "25000185040202348",
        nome_convenente: "Hospital de Clínicas",
        tipo: "concluido_sem_inauguracao_real",
      },
      {
        nr_convenio: "111",
        nome_convenente: "Outro hospital",
        tipo: "andamento_sem_previsao",
      },
    ]);

    const semData = screen.getByRole("region", {
      name: "Concluído sem data de conclusão",
    });
    expect(within(semData).getByText("(1)")).toBeInTheDocument();
    expect(
      within(semData).getByRole("link", { name: "25000185040202348" }),
    ).toHaveAttribute("href", expect.stringContaining("25000185040202348"));
    expect(
      within(
        screen.getByRole("region", { name: "Em andamento sem previsão" }),
      ).getByText("Outro hospital"),
    ).toBeInTheDocument();
  });

  it("grupo sem registros diz que não há nenhum no recorte", () => {
    renderizar([]);
    expect(screen.getAllByText("Nenhum no recorte.")).toHaveLength(3);
  });

  it("deixa claro que não indica atraso", () => {
    renderizar([]);
    expect(screen.getByText(/Não indicam atraso/)).toBeInTheDocument();
  });
});
