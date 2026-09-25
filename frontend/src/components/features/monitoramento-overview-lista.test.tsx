import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MonitoramentoOverviewLista } from "./monitoramento-overview-lista";

describe("MonitoramentoOverviewLista", () => {
  it("encontra instrumento monitorado pelo CNES", async () => {
    render(
      <MemoryRouter>
        <MonitoramentoOverviewLista
          instrumentos={[
            {
              nr_convenio: "953749",
              cnes: "1234567",
              nome_convenente: "Hospital de teste",
              municipio: "Brasília",
              uf: "DF",
              tecnico_titular: null,
              tipo_contratacao: "Convênio",
              fase_atual: "Não iniciado",
              situacao_prestacao_contas: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    await userEvent.type(
      screen.getByPlaceholderText("Buscar convênio, convenente ou CNES..."),
      "1234567",
    );

    expect(screen.getByRole("link", { name: "953749" })).toBeVisible();
  });
});
