import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MonitoramentoOverviewLista } from "./monitoramento-overview-lista";

describe("MonitoramentoOverviewLista", () => {
  it("exibe os instrumentos já recortados pela barra de filtros da página", () => {
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

    expect(screen.getByRole("link", { name: "953749" })).toBeVisible();
  });
});
