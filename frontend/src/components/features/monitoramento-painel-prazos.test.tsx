import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MonitoramentoPainelPrazos } from "./monitoramento-painel-prazos";

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

describe("MonitoramentoPainelPrazos", () => {
  it("abre a vigência e ordena a agenda pelo prazo mais antigo", () => {
    render(
      <MemoryRouter>
        <MonitoramentoPainelPrazos
          vigencias={[
            {
              nr_convenio: "123",
              nome_convenente: "Hospital Alfa",
              data_final: "2026-11-10",
              dias: 42,
            },
          ]}
          licencas={licencas}
          inauguracoes={inauguracoes}
          divergencias={[]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Instrumentos com vigência a encerrar/,
      }),
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("link", {
        name: /Hospital Alfa/,
      }),
    ).toBeVisible();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    expect(screen.getByText("Vencida há 9 dias")).toBeVisible();
    expect(screen.getByText("Atrasada há 4 dias")).toBeVisible();

    const agenda = screen.getByRole("heading", { name: "Agenda de prazos" })
      .parentElement?.parentElement;
    expect(agenda).toBeTruthy();
    const links = within(agenda!).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Hospital Alfa"),
      expect.stringContaining("Hospital Gama"),
      expect.stringContaining("Hospital Beta"),
    ]);
  });

  it("pagina agenda e divergências sem perder registros", () => {
    render(
      <MemoryRouter>
        <MonitoramentoPainelPrazos
          vigencias={[]}
          licencas={Array.from({ length: 9 }, (_, i) => ({
            ...licencas[0]!,
            nr_convenio: `L${i}`,
            nome_convenente: `Licença ${i}`,
            dias: i,
          }))}
          inauguracoes={[]}
          divergencias={Array.from({ length: 9 }, (_, i) => ({
            nr_convenio: `D${i}`,
            nome_convenente: `Divergência ${i}`,
            tipo_contratacao: "Convênio",
            fase_interna: "Concluído",
            fonte_externa: "TransfereGov",
            risco: "Divergência",
            status_externo_original: "Aberto",
            status_externo_normalizado: "aberto",
            atualizado_em: "2026-09-29",
          }))}
        />
      </MemoryRouter>,
    );
    const agenda = screen.getByRole("navigation", {
      name: "Paginação da agenda de prazos",
    });
    const divergencias = screen.getByRole("navigation", {
      name: "Paginação de divergências",
    });
    fireEvent.click(within(agenda).getByRole("button", { name: /Próxima/ }));
    fireEvent.click(
      within(divergencias).getByRole("button", { name: /Próxima/ }),
    );
    expect(screen.getByText("Licença 8")).toBeVisible();
    expect(screen.getByText("Divergência 8")).toBeVisible();
  });
});
