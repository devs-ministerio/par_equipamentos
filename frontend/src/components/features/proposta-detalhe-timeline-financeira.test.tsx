import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PropostaDetalheTimelineFinanceira } from "./proposta-detalhe-timeline-financeira";

const parceria = {
  cd_parceria: "QA-001",
  id_parceria: 1,
  in_situacao_parceria: "Em execução",
};
function criarTimeline() {
  return {
    contas: [
      {
        nm_banco: "Banco sintético",
        nm_agencia: "0001",
        sg_uf_agencia: "GO",
        tx_conta: "0000-QA",
        tx_descricao: "Conta sintética",
      },
      {},
    ],
    empenhos: [
      {
        numero_empenho: "2026NE-QA",
        nr_empenho: 999,
        in_situacao_siafi: "Emitido",
        data_emissao: "2026-10-01T12:00:00",
        valor_empenho: 1000,
      },
      { nr_empenho: 123, valor_empenho: 0 },
      {},
    ],
    documentos_habeis: [
      {
        nr_documento_habil: "DH-QA",
        in_situacao_dh: "Liquidado",
        dt_emissao: "2026-10-02T00:00:00",
        vl_documento_habil: 500,
      },
      {},
    ],
    ordens_pagamento: [
      {
        nr_ordem_pagamento: "OP-QA",
        in_situacao_op: "Pago",
        dt_emissao_op: "2026-10-03T00:00:00",
        vl_ordem_pagamento: 400,
      },
      {},
    ],
  };
}
afterEach(cleanup);
describe("Execução financeira capturada após parceria", () => {
  it("não expõe execução financeira sem a existência de parceria", () => {
    // Given / When
    const { container } = render(
      <PropostaDetalheTimelineFinanceira
        parceria={null}
        timeline={criarTimeline()}
      />,
    );
    // Then
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    null,
    {},
    {
      contas: null,
      empenhos: "inválido",
      documentos_habeis: {},
      ordens_pagamento: false,
    },
  ])(
    "preserva identificação da parceria sem inventar movimentações: %j",
    (timeline) => {
      // Given / When
      render(
        <PropostaDetalheTimelineFinanceira
          parceria={parceria}
          timeline={timeline}
        />,
      );
      // Then
      expect(screen.getByText("QA-001")).toBeInTheDocument();
      expect(screen.getByText("Em execução")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByText("Conta bancária")).not.toBeInTheDocument();
    },
  );

  it("exibe os movimentos reais nas estruturas desktop e móvel com datas e zeros preservados", () => {
    // Given
    const timeline = criarTimeline();
    // When
    render(
      <PropostaDetalheTimelineFinanceira
        parceria={parceria}
        timeline={timeline}
      />,
    );
    // Then
    expect(
      screen.getByText(/Banco sintético — ag. 0001 \(GO\), conta 0000-QA/),
    ).toBeInTheDocument();
    expect(screen.getByText("Conta sintética")).toBeInTheDocument();
    const tabela = within(screen.getByRole("table"));
    const linhas = tabela.getAllByRole("row");
    expect(linhas).toHaveLength(15); // Cabeçalho + sete movimentos em dois layouts.
    expect(linhas[1]).toHaveTextContent(
      "Empenho (SIAFI)2026NE-QAEmitido01/10/2026R$ 1.000",
    );
    expect(linhas[3]).toHaveTextContent("123—R$ 0");
    expect(linhas[7]).toHaveTextContent("DH-QALiquidado02/10/2026R$ 500");
    expect(linhas[11]).toHaveTextContent("OP-QAPago03/10/2026R$ 400");
    expect(screen.getAllByText("2026NE-QA")).toHaveLength(2);
    expect(screen.queryByText("999")).not.toBeInTheDocument();
    expect(screen.getAllByText("R$ 0")).toHaveLength(2);
    expect(screen.queryByText(/T00:00:00/)).not.toBeInTheDocument();
  });

  it.each(["empenhos", "documentos_habeis", "ordens_pagamento"])(
    "mostra tabela mesmo quando só existem %s, removendo captura anterior",
    (tipo) => {
      // Given
      const dados = criarTimeline();
      const { rerender } = render(
        <PropostaDetalheTimelineFinanceira
          parceria={parceria}
          timeline={dados}
        />,
      );
      // When
      rerender(
        <PropostaDetalheTimelineFinanceira
          parceria={{}}
          timeline={{ [tipo]: [{}] }}
        />,
      );
      // Then
      expect(
        within(screen.getByRole("table")).getAllByRole("row"),
      ).toHaveLength(3);
      expect(screen.queryByText("QA-001")).not.toBeInTheDocument();
      expect(screen.queryByText("Banco sintético")).not.toBeInTheDocument();
      expect(screen.queryByText("2026NE-QA")).not.toBeInTheDocument();
      expect(screen.queryByText("R$ 1.000")).not.toBeInTheDocument();
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    },
  );
});
