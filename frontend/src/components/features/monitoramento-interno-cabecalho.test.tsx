import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { InstrumentoTimeline } from "@/services/monitoramento-instrumentos";
import { MonitoramentoInternoCabecalho } from "./monitoramento-interno-cabecalho";

function renderizar(situacao: string | null) {
  const timeline = {
    instrumento: {
      nr_convenio: "825374",
      tipo_contratacao: "Convênio",
      nome_convenente: "Hospital de teste",
      municipio: "Urussanga",
      uf: "SC",
      situacao_prestacao_contas: situacao,
    },
    ao_vivo: { disponivel: false },
  } as unknown as InstrumentoTimeline;

  render(
    <MonitoramentoInternoCabecalho
      timeline={timeline}
      componenteViaSiconv={null}
      dataInauguracao={null}
      inaugurado
      diasInauguracao={null}
      statusLicenca="Sem registro"
      alertaLicenca={false}
      acoesAbertasCount={0}
      acoesAtrasadasCount={0}
    />,
  );
}

describe("MonitoramentoInternoCabecalho", () => {
  it("não interpreta situação externa ausente como prestação de contas pendente", () => {
    renderizar(null);

    expect(
      screen.getByText("Situação externa ainda não verificada"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/pendente de conclusão/i),
    ).not.toBeInTheDocument();
  });

  it("mostra a conclusão confirmada na fonte externa", () => {
    renderizar("Prestação de Contas Concluída");

    expect(
      screen.getByText("Prestação de Contas Concluída"),
    ).toBeInTheDocument();
    expect(screen.getByText("Concluída")).toBeInTheDocument();
  });
});
