import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MonitoramentoPainelPendencias } from "./monitoramento-painel-pendencias";

const licencas = [
  {
    nr_convenio: "123",
    nome_convenente: "Hospital Alfa",
    data_validade: "2026-09-20",
    dias: -9,
  },
  {
    nr_convenio: "456",
    nome_convenente: "Hospital Beta",
    data_validade: "2026-11-20",
    dias: 52,
  },
];

const inauguracoes = [
  {
    nr_convenio: "789",
    nome_convenente: "Hospital Gama",
    municipio: null,
    uf: null,
    equipamento: null,
    data: "2026-09-25",
    realizada: false,
    dias: -4,
  },
];

function renderPendencias(filtrado = false) {
  return render(
    <MemoryRouter>
      <MonitoramentoPainelPendencias
        licencas={licencas}
        inauguracoes={inauguracoes}
        divergencias={[]}
        semTecnico={1}
        acoesAtrasadas={filtrado ? 1 : 3}
        acoesPendentes={filtrado ? 2 : 5}
        licencasCnenDeferidas={
          filtrado ? { quantidade: 1, total: 4 } : { quantidade: 2, total: 8 }
        }
      />
    </MemoryRouter>,
  );
}

describe("MonitoramentoPainelPendencias", () => {
  it("resume os alertas do recorte", () => {
    renderPendencias();

    const resumo = screen.getByLabelText("Resumo das pendências");
    expect(
      within(resumo).getByText("Licenças em menos de 90 dias"),
    ).toBeVisible();
    expect(within(resumo).getByText("Inaugurações atrasadas")).toBeVisible();
    expect(screen.getByText("2/8")).toBeVisible();
  });

  it("apresenta as métricas próprias do recorte filtrado", () => {
    renderPendencias(true);

    expect(screen.getByText("1/4")).toBeVisible();
    expect(screen.queryByText("2/8")).not.toBeInTheDocument();
  });
});
