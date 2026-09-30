import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MonitoramentoPainelEvolucao } from "./monitoramento-painel-evolucao";

describe("MonitoramentoPainelEvolucao", () => {
  it("usa barra única em anos passados e divide realizadas/previstas a partir do ano corrente", () => {
    const anoAnterior = String(new Date().getFullYear() - 1);
    const anoCorrente = String(new Date().getFullYear());
    const anoFuturo = String(new Date().getFullYear() + 1);
    render(
      <MemoryRouter>
        <MonitoramentoPainelEvolucao
          inauguracoesPorAno={[
            { ano: anoAnterior, realizadas: 3, previstas: 0 },
            { ano: anoCorrente, realizadas: 1, previstas: 1 },
            { ano: anoFuturo, realizadas: 0, previstas: 2 },
          ]}
          previsoesVencidas={1}
          porTipo={[
            { rotulo: "FAF", quantidade: 1, comValor: 1, valor: 250000 },
          ]}
          total={2}
          semCnes={0}
          semCoordenadas={0}
          semTecnico={0}
          semAno={0}
          comPagamentoDeterminado={1}
          cargasManuais={1}
          viewerRole="leitor"
        />
      </MemoryRouter>,
    );

    const legenda = screen.getByLabelText("Legenda das inaugurações");
    expect(within(legenda).getByText("Realizadas")).toBeVisible();
    expect(within(legenda).getByText("Previstas")).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: new RegExp(
          `${anoAnterior}: 3 realizadas; ${anoCorrente}: 1 realizadas, 1 previstas; ${anoFuturo}: 0 realizadas, 2 previstas`,
        ),
      }),
    ).toBeVisible();
    expect(screen.getByTitle(`${anoAnterior}: 3 realizadas`)).toHaveStyle({
      height: "145px",
    });
    expect(screen.getByTitle(`${anoAnterior}: 3 realizadas`)).toHaveClass(
      "w-full",
    );
    expect(
      screen.queryByTitle(`${anoAnterior}: 0 previstas`),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle(`${anoCorrente}: 1 realizadas`)).toHaveClass(
      "w-full",
    );
    expect(screen.getByTitle(`${anoCorrente}: 1 previstas`)).toHaveClass(
      "w-full",
    );
    expect(
      screen.getByTitle(`${anoAnterior}: 3 realizadas`).parentElement,
    ).toHaveClass("translate-x-1/2");
    expect(
      screen.getByTitle(`${anoCorrente}: 1 realizadas`).parentElement,
    ).not.toHaveClass("translate-x-1/2");
    expect(
      screen.getByTitle(`${anoCorrente}: 1 previstas`).parentElement,
    ).toHaveClass("min-w-0");
    expect(
      parseFloat(screen.getByTitle(`${anoFuturo}: 2 previstas`).style.height),
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/previsões vencidas aparecem na agenda/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Completude do recorte")).not.toBeInTheDocument();
    expect(screen.queryByText("Resumo gerado em")).not.toBeInTheDocument();
  });

  it("mostra completude apenas para administrador", () => {
    render(
      <MemoryRouter>
        <MonitoramentoPainelEvolucao
          inauguracoesPorAno={[]}
          previsoesVencidas={4}
          porTipo={[]}
          total={2}
          semCnes={0}
          semCoordenadas={0}
          semTecnico={1}
          semAno={0}
          comPagamentoDeterminado={1}
          cargasManuais={0}
          viewerRole="admin"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Completude do recorte")).toBeVisible();
    expect(
      screen.getByText(/4 previsões vencidas aparecem na agenda/),
    ).toBeVisible();
  });

  it("mostra a nota de previsões vencidas para gestor, sem a completude administrativa", () => {
    render(
      <MemoryRouter>
        <MonitoramentoPainelEvolucao
          inauguracoesPorAno={[]}
          previsoesVencidas={4}
          porTipo={[]}
          total={2}
          semCnes={0}
          semCoordenadas={0}
          semTecnico={0}
          semAno={0}
          comPagamentoDeterminado={1}
          cargasManuais={0}
          viewerRole="gestor"
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/4 previsões vencidas aparecem na agenda/),
    ).toBeVisible();
    expect(screen.queryByText("Completude do recorte")).not.toBeInTheDocument();
  });
});
