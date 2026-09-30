import { fireEvent, render, screen, within } from "@testing-library/react";
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
        divergenciasPorFonte=""
        semTecnico={1}
        acoesAtrasadas={filtrado ? 1 : 3}
        acoesPendentes={filtrado ? 2 : 5}
        licencasCnenDeferidas={
          filtrado ? { quantidade: 1, total: 4 } : { quantidade: 2, total: 8 }
        }
        acoes={[]}
        filaTruncada={false}
      />
    </MemoryRouter>,
  );
}

describe("MonitoramentoPainelPendencias", () => {
  it("resume os alertas e ordena a agenda pelo prazo mais antigo", () => {
    renderPendencias();

    const resumo = screen.getByLabelText("Resumo das pendências");
    expect(
      within(resumo).getByText("Licenças em menos de 90 dias"),
    ).toBeVisible();
    expect(within(resumo).getByText("Inaugurações atrasadas")).toBeVisible();
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
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.getByText("Vencida há 9 dias")).toBeVisible();
    expect(screen.getByText("Atrasada há 4 dias")).toBeVisible();
    expect(screen.getByText("2/8")).toBeVisible();

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

  it("pagina todas as listas operacionais sem perder registros", () => {
    render(
      <MemoryRouter>
        <MonitoramentoPainelPendencias
          vigencias={[]}
          licencas={Array.from({ length: 9 }, (_, i) => ({
            ...licencas[0],
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
          divergenciasPorFonte=""
          semTecnico={0}
          acoesAtrasadas={0}
          acoesPendentes={9}
          licencasCnenDeferidas={{ quantidade: 0, total: 0 }}
          acoes={Array.from({ length: 9 }, (_, i) => ({
            id: i + 1,
            nr_convenio: `A${i}`,
            nome_convenente: `Hospital ${i}`,
              descricao: `Ação ${i}`,
              data_prevista: null,
            responsavel: null,
            dias: i,
          }))}
          filaTruncada={false}
        />
      </MemoryRouter>,
    );
    const agenda = screen.getByRole("navigation", {
      name: "Paginação da agenda de prazos",
    });
    const divergencias = screen.getByRole("navigation", {
      name: "Paginação de divergências",
    });
    const acoes = screen.getByRole("navigation", {
      name: "Paginação da fila de ações",
    });
    fireEvent.click(within(agenda).getByRole("button", { name: /Próxima/ }));
    fireEvent.click(
      within(divergencias).getByRole("button", { name: /Próxima/ }),
    );
    fireEvent.click(within(acoes).getByRole("button", { name: /Próxima/ }));
    expect(screen.getByText("Licença 8")).toBeVisible();
    expect(screen.getByText("Divergência 8")).toBeVisible();
    expect(screen.getByText("Ação 8")).toBeVisible();
  });

  it("apresenta as métricas próprias do recorte filtrado", () => {
    renderPendencias(true);

    expect(screen.getByText("1/4")).toBeVisible();
    expect(screen.queryByText("2/8")).not.toBeInTheDocument();
  });
});
