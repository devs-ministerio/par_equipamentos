import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SiconvEntrada } from "@/types/monitoramento";
import { SiconvSubAbas } from "./siconv-sub-abas";

const fonte: SiconvEntrada = {
  convenio: {},
  programa: null,
  itens_plano_aplicacao: [
    {
      ID_ITEM_PAD: "1",
      DESCRICAO_ITEM: "Mamógrafo digital",
      QTD_ITEM: "2",
      VALOR_UNITARIO_ITEM: "1000,50",
      VALOR_TOTAL_ITEM: "2001,00",
    },
  ],
  empenhos: [
    {
      ID_EMPENHO: "2",
      NR_EMPENHO: "2026NE001",
      DESC_SITUACAO_EMPENHO: "Emitido",
      VALOR_EMPENHO: "0",
    },
  ],
  desembolsos: [
    {
      ID_DESEMBOLSO: "3",
      DATA_DESEMBOLSO: "02/10/2026",
      VL_DESEMBOLSADO: "1500,00",
    },
  ],
  licitacoes: [
    {
      ID_LICITACAO: "4",
      NR_PROCESSO_LICITACAO: "Processo 004",
      TP_PROCESSO_COMPRA: "Pregão eletrônico",
      STATUS_LICITACAO: "Concluída",
      VALOR_LICITACAO: "2001,00",
    },
  ],
  termos_aditivos: [
    {
      TIPO_TA: "Prorrogação",
      VL_GLOBAL_TA: "2001,00",
      JUSTIFICATIVA_TA: "Ampliação do prazo",
    },
  ],
  pagamentos: [
    {
      NR_MOV_FIN: "5",
      NOME_FORNECEDOR: "Fornecedor sintético",
      DATA_PAG: "03/10/2026",
      VL_PAGO: "-100,50",
      DESC_DL: "Estorno documentado",
    },
  ],
};

describe("coleções oficiais do SICONV em celular e desktop", () => {
  it.each([
    ["Itens do plano", "Mamógrafo digital", "R$ 2.001"],
    ["Empenhos", "2026NE001", "R$ 0"],
    ["Desembolsos", "02/10/2026", "R$ 1.500"],
    ["Licitações", "Processo 004", "R$ 2.001"],
    ["Termos aditivos", "Prorrogação", "R$ 2.001"],
    ["Fornecedores", "Fornecedor sintético", "-R$ 101"],
  ])(
    "apresenta %s sem misturar repasse e pagamento ao fornecedor",
    (aba, identificador, valor) => {
      render(<SiconvSubAbas siconv={fonte} />);
      fireEvent.click(screen.getByRole("button", { name: `${aba} (1)` }));
      const card = screen.getByRole("article");
      const tabela = screen.getByRole("table");
      expect(within(card).getByText(identificador)).toBeInTheDocument();
      expect(within(tabela).getByText(identificador)).toBeInTheDocument();
      const formatado = valor.replace(/\s/g, "");
      expect(card.textContent?.replace(/\s/g, "")).toContain(formatado);
      expect(tabela.textContent?.replace(/\s/g, "")).toContain(formatado);
    },
  );

  it("exibe ausência explícita e desabilita categorias sem dados", () => {
    const vazio = {
      ...fonte,
      itens_plano_aplicacao: [],
      empenhos: [],
      desembolsos: [],
      licitacoes: [],
      termos_aditivos: [],
      pagamentos: [],
    };
    render(<SiconvSubAbas siconv={vazio} />);
    expect(screen.getAllByText("Sem registro nessa categoria.")).toHaveLength(
      2,
    );
    for (const botao of screen.getAllByRole("button"))
      expect(botao).toBeDisabled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("seleciona a primeira categoria preenchida e preserva ausência de modalidade", () => {
    render(
      <SiconvSubAbas
        siconv={{
          ...fonte,
          itens_plano_aplicacao: [],
          empenhos: [],
          desembolsos: [],
          licitacoes: [
            {
              ...fonte.licitacoes[0]!,
              TP_PROCESSO_COMPRA: "",
              MODALIDADE_LICITACAO: "",
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("table")).toHaveTextContent("Processo 004");
    expect(
      within(screen.getByRole("table")).getByText("—"),
    ).toBeInTheDocument();
  });

  it("usa modalidade alternativa, sem preencher justificativa ou documento inexistentes", () => {
    render(
      <SiconvSubAbas
        siconv={{
          ...fonte,
          licitacoes: [
            {
              ...fonte.licitacoes[0]!,
              TP_PROCESSO_COMPRA: "",
              MODALIDADE_LICITACAO: "Dispensa",
            },
          ],
          termos_aditivos: [{ TIPO_TA: "Prorrogação", VL_GLOBAL_TA: "0" }],
          pagamentos: [
            { NOME_FORNECEDOR: "Fornecedor sintético", VL_PAGO: "0" },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Licitações (1)" }));
    expect(screen.getAllByText("Dispensa")).toHaveLength(2);
    fireEvent.click(
      screen.getByRole("button", { name: "Termos aditivos (1)" }),
    );
    expect(screen.getByRole("table")).toHaveTextContent("R$ 0");
    fireEvent.click(screen.getByRole("button", { name: "Fornecedores (1)" }));
    expect(screen.getByRole("article")).toHaveTextContent("—");
  });
});
