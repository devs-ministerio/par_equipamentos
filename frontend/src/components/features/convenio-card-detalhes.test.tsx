import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ConvenioUnificado } from "@/types/monitoramento";
import { ConvenioCardDetalhes } from "./convenio-card-detalhes";
import { ConvenioCardHeader } from "./convenio-card-header";
import { ConvenioCard } from "./convenio-card";

const convenioManual: ConvenioUnificado = {
  numero: "25000000145202506",
  numeroInstrumento: null,
  anoInstrumento: null,
  objeto: "",
  situacao: "Em execução",
  situacaoPortal: "",
  situacaoContratacao: null,
  tipoContratacao: "TED",
  tipologia: null,
  convenente: { nome: "Hospital de teste", cnpj: null, tipo: "" },
  municipio: "Brasília",
  uf: "DF",
  codigoIbge: "",
  regiao: "",
  orgao: "",
  unidadeGestora: "",
  subfuncao: "",
  funcao: "",
  tipoInstrumento: "",
  numeroProcesso: "",
  cnes: null,
  cnesNomeEstabelecimento: null,
  programa: "Programa de teste",
  equipamentos: [],
  dadosOficiaisDisponiveis: false,
  desembolsoIntegralDaCarga: true,
  valorPagoFornecedor: null,
  pagamentosCount: 0,
  datas: {
    publicacao: null,
    inicioVigencia: null,
    fimVigencia: null,
    conclusao: null,
    ultimaLiberacao: null,
  },
  financeiro: {
    global: 100_000,
    repasse: null,
    empenhado: null,
    desembolsado: 100_000,
    contrapartida: null,
    saldoConta: null,
    ultimaLiberacaoValor: null,
    fonteConfiavel: false,
  },
  siconv: null,
  transferegov: null,
};

describe("ConvenioCardDetalhes", () => {
  it("permite expandir e recolher os detalhes técnicos", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ConvenioCard c={convenioManual} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Mais detalhes")).toBeInTheDocument();

    await user.click(screen.getByText("Mais detalhes"));

    expect(screen.getByText("Menos detalhes")).toBeInTheDocument();
    await user.click(screen.getByText("Menos detalhes"));
    expect(screen.getByText("Mais detalhes")).toBeInTheDocument();
  });

  it("não exibe texto de ausência quando o programa está vazio", () => {
    render(
      <ConvenioCardHeader
        c={{ ...convenioManual, programa: null }}
        monitorado={false}
        faseMonitoramento={null}
        equipamentos={[]}
        programaSiconv={null}
        valorPagoFornecedor={null}
        pagamentosCount={0}
      />,
    );

    expect(screen.queryByText("Programa:")).not.toBeInTheDocument();
    expect(
      screen.queryByText("não encontrado em nenhuma fonte"),
    ).not.toBeInTheDocument();
  });

  it("exibe somente monitoramento interno para instrumento de carga manual", () => {
    render(
      <MemoryRouter>
        <ConvenioCardDetalhes c={convenioManual} monitorado />
      </MemoryRouter>,
    );

    expect(screen.getByText("Monitoramento interno")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver detalhes →" }),
    ).toHaveAttribute(
      "href",
      "/monitoramento-equipamentos/instrumentos/25000000145202506",
    );
    expect(
      screen.queryByText("Dados aninhados (SICONV)"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Financeiro detalhado")).not.toBeInTheDocument();
  });

  it("monta a linha do tempo apenas com eventos financeiros oficiais datados", () => {
    const convenioOficial: ConvenioUnificado = {
      ...convenioManual,
      tipoContratacao: "Convênio",
      dadosOficiaisDisponiveis: true,
      desembolsoIntegralDaCarga: false,
      datas: { ...convenioManual.datas, publicacao: "2026-01-15" },
      siconv: {
        convenio: {},
        programa: null,
        empenhos: [],
        desembolsos: [
          {
            ID_DESEMBOLSO: "1",
            DATA_DESEMBOLSO: "20/02/2026",
            VL_DESEMBOLSADO: "30000",
          },
        ],
        licitacoes: [],
        termos_aditivos: [],
        pagamentos: [{ DATA_PAG: "22/02/2026", VL_PAGO: "15000" }],
        itens_plano_aplicacao: [],
      },
    };

    render(
      <MemoryRouter>
        <ConvenioCardDetalhes c={convenioOficial} monitorado />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Linha do tempo financeira/)).toBeInTheDocument();
    // A linha do tempo tem apresentações distintas para celular e desktop.
    expect(screen.getAllByText("Instrumento publicado")).toHaveLength(2);
    expect(screen.getAllByText("Desembolso registrado")).toHaveLength(2);
    expect(screen.getAllByText("Pagamento ao fornecedor")).toHaveLength(2);
  });
});
