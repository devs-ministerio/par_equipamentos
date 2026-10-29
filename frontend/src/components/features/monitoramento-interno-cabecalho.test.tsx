import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { InstrumentoTimeline } from "@/services/monitoramento-instrumentos";
import { MonitoramentoInternoCabecalho } from "./monitoramento-interno-cabecalho";

function renderizar(
  situacao: string | null,
  identidade: { nr_convenio: string; tipo_contratacao: string } = {
    nr_convenio: "825374",
    tipo_contratacao: "Convênio",
  },
) {
  const timeline = {
    instrumento: {
      ...identidade,
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
      registroLicenca={null}
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

  it("mostra o NUP formatado só em FAF e TED", () => {
    renderizar(null, {
      nr_convenio: "25000198305202459",
      tipo_contratacao: "FAF",
    });
    expect(screen.getByText("NUP 25000.198305/2024-59")).toBeInTheDocument();
  });

  it("não mostra NUP em convênio", () => {
    renderizar(null);
    expect(screen.queryByText(/^NUP /)).not.toBeInTheDocument();
  });
});
