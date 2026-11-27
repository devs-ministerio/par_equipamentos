import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { InstrumentoTimeline } from "@/services/monitoramento-instrumentos";
import { MonitoramentoInternoCabecalho } from "./monitoramento-interno-cabecalho";

function renderizar(
  situacao: string | null,
  identidade: { nr_convenio: string; tipo_contratacao: string } = {
    nr_convenio: "825374",
    tipo_contratacao: "Convênio",
  },
  extra: Record<string, unknown> = {},
  inauguracao: { data: string | null; realizada: boolean } = {
    data: null,
    realizada: true,
  },
) {
  const timeline = {
    instrumento: {
      ...identidade,
      nome_convenente: "Hospital de teste",
      municipio: "Urussanga",
      uf: "SC",
      situacao_prestacao_contas: situacao,
      ...extra,
    },
    ao_vivo: { disponivel: false },
  } as unknown as InstrumentoTimeline;

  render(
    <MonitoramentoInternoCabecalho
      timeline={timeline}
      componenteViaSiconv={null}
      dataInauguracao={inauguracao.data}
      inaugurado={inauguracao.realizada}
      inauguracaoDispensada={false}
      diasInauguracao={null}
      acoesAbertasCount={0}
      acoesAtrasadasCount={0}
    />,
  );
}

describe("MonitoramentoInternoCabecalho", () => {
  it("não interpreta situação externa ausente como prestação de contas pendente", () => {
    renderizar(null);

    expect(screen.getByText("Sem dado")).toBeInTheDocument();
    expect(screen.queryByText("Ainda não concluída")).not.toBeInTheDocument();
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

  it("mostra a data na inauguração realizada e na prevista", () => {
    renderizar(null, undefined, {}, { data: "2026-12-01", realizada: false });
    expect(screen.getByText("Prevista em 01/12/2026")).toBeInTheDocument();
    cleanup();
    renderizar(null, undefined, {}, { data: "2026-10-07", realizada: true });
    expect(screen.getByText("Realizada em 07/10/2026")).toBeInTheDocument();
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

  it("mostra a fase geral como situação do programa só em PERSUS I", () => {
    renderizar(
      null,
      { nr_convenio: "PS1-1", tipo_contratacao: "PERSUS I" },
      { situacao_programa: "Em execução", fase_atual: "Pós-entrega" },
    );

    expect(screen.getByText("Situação do programa")).toBeInTheDocument();
    expect(screen.getByText("Pós-entrega")).toBeInTheDocument();
    expect(screen.queryByText("Em execução")).not.toBeInTheDocument();
  });

  it("não mostra a situação do programa em convênio, mesmo preenchida", () => {
    renderizar(
      "Prestação de Contas Concluída",
      { nr_convenio: "825374", tipo_contratacao: "Convênio" },
      {
        situacao_programa: "Prestação de Contas Concluída",
        fase_atual: "Concluído",
      },
    );

    expect(screen.queryByText("Situação do programa")).not.toBeInTheDocument();
    expect(
      screen.getByText("Prestação de contas (SICONV)"),
    ).toBeInTheDocument();
  });
});
