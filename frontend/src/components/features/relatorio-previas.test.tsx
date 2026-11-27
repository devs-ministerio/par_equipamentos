import {
  cleanup,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  criarInstrumentosPrevia,
  criarPropostasPrevia,
  criarPropostaPrevia,
} from "@/test-fixtures/relatorios-previa";
import {
  criarConvenioTeste,
  criarMarcadorTeste,
} from "@/test-fixtures/dados-oficiais";
import { montarControlesRelatorio } from "./relatorio-filtros-controles";
import { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import { RelatorioRegistrosTabela } from "./relatorio-registros-tabela";
import { linhaDeConvenio, linhaDeProposta } from "@/lib/relatorio-linhas";

const convenio = (c: Parameters<typeof linhaDeConvenio>[0]) =>
  linhaDeConvenio(c, new Map());
const proposta = (p: Parameters<typeof linhaDeProposta>[0]) =>
  linhaDeProposta(p, new Map());

type TipoPrevia = "instrumentos" | "propostas";
function previa(tipo: TipoPrevia, total: number, onLimparFiltros?: () => void) {
  return tipo === "instrumentos" ? (
    <RelatorioRegistrosTabela
      itens={criarInstrumentosPrevia(total).map(convenio)}
      onLimparFiltros={onLimparFiltros}
    />
  ) : (
    <RelatorioRegistrosTabela
      itens={criarPropostasPrevia(total).map(proposta)}
      onLimparFiltros={onLimparFiltros}
    />
  );
}
afterEach(cleanup);

describe.each<TipoPrevia>(["instrumentos", "propostas"])(
  "Prévia de %s",
  (tipo) => {
    it("pagina 45 registros nos dois layouts sem perder nem repetir itens", async () => {
      // Given
      const user = userEvent.setup();
      render(previa(tipo, 45));
      expect(
        within(screen.getByRole("table")).getAllByRole("row"),
      ).toHaveLength(21);
      expect(screen.getAllByRole("article")).toHaveLength(20);
      expect(screen.getAllByText("Unidade 001")).toHaveLength(2);
      expect(screen.queryByText("Unidade 021")).not.toBeInTheDocument();
      // When
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
      // Then
      expect(screen.getByText("Mostrando 21–40 de 45")).toBeInTheDocument();
      expect(screen.getAllByText("Unidade 021")).toHaveLength(2);
      expect(screen.queryByText("Unidade 001")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
      expect(screen.getAllByRole("article")).toHaveLength(5);
      expect(screen.getByText("Mostrando 41–45 de 45")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Próxima página" }),
      ).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Página anterior" }));
      expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    });

    it("volta à primeira página quando os filtros reduzem um recorte já paginado", async () => {
      // Given
      const user = userEvent.setup();
      const { rerender } = render(previa(tipo, 45));
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
      // When
      rerender(previa(tipo, 3));
      // Then
      expect(screen.getAllByText("Unidade 001")).toHaveLength(2);
      expect(screen.getAllByRole("article")).toHaveLength(3);
      expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
      expect(screen.getByText("Mostrando 1–3 de 3")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Página anterior" }),
      ).toBeDisabled();
    });

    it("preserva uma página válida quando a mesma carteira é atualizada sem mudar IDs", async () => {
      // Given
      const user = userEvent.setup();
      const { rerender } = render(previa(tipo, 45));
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
      // When
      rerender(
        tipo === "instrumentos" ? (
          <RelatorioRegistrosTabela
            itens={criarInstrumentosPrevia(45).map((item, i) => ({
              ...convenio(item),
              estabelecimento: `Atualizada ${i + 1}`,
            }))}
          />
        ) : (
          <RelatorioRegistrosTabela
            itens={criarPropostasPrevia(45).map((item, i) => ({
              ...proposta(item),
              estabelecimento: `Atualizada ${i + 1}`,
            }))}
          />
        ),
      );
      // Then
      expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
      expect(screen.getAllByText("Atualizada 21")).toHaveLength(2);
      expect(screen.queryByText("Unidade 021")).not.toBeInTheDocument();
    });

    it("reinicia quando os IDs do recorte mudam mesmo mantendo o total", async () => {
      // Given
      const user = userEvent.setup();
      const { rerender } = render(previa(tipo, 45));
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
      // When
      rerender(
        tipo === "instrumentos" ? (
          <RelatorioRegistrosTabela
            itens={criarInstrumentosPrevia(45).map((item) =>
              convenio({ ...item, numero: `OUTRO-${item.numero}` }),
            )}
          />
        ) : (
          <RelatorioRegistrosTabela
            itens={criarPropostasPrevia(45).map((item) =>
              proposta({ ...item, id: item.id + 100 }),
            )}
          />
        ),
      );
      // Then
      expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
      expect(screen.getAllByText("Unidade 001")).toHaveLength(2);
      expect(screen.queryByText("Unidade 021")).not.toBeInTheDocument();
    });

    it("substitui o recorte por vazio e retorna à primeira página ao limpar filtros", async () => {
      // Given
      const user = userEvent.setup();
      const limpar = vi.fn();
      const { rerender } = render(previa(tipo, 45, limpar));
      await user.click(screen.getByRole("button", { name: "Próxima página" }));
      // When
      rerender(previa(tipo, 0, limpar));
      // Then
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Próxima página" }),
      ).not.toBeInTheDocument();
      const botoes = screen.getAllByRole("button", { name: "Limpar filtros" });
      expect(botoes).toHaveLength(2);
      await user.click(botoes[0]);
      await user.click(botoes[1]);
      expect(limpar).toHaveBeenCalledTimes(2);
      rerender(previa(tipo, 45));
      expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
      expect(screen.getAllByText("Unidade 001")).toHaveLength(2);
    });

    it.each([1, 20, 21])(
      "respeita o limite de página para %s registros",
      (total) => {
        // Given / When
        render(previa(tipo, total));
        // Then
        expect(screen.getAllByRole("article")).toHaveLength(
          Math.min(total, 20),
        );
        expect(
          screen.getByText(`Mostrando 1–${Math.min(total, 20)} de ${total}`),
        ).toBeInTheDocument();
        const proxima = screen.getByRole("button", { name: "Próxima página" });
        if (total <= 20) expect(proxima).toBeDisabled();
        else expect(proxima).toBeEnabled();
      },
    );

    it("não oferece limpeza quando não recebeu essa ação", () => {
      // Given / When
      render(previa(tipo, 0));
      // Then
      expect(screen.getAllByText(/bate com esse filtro/)).toHaveLength(2);
      expect(
        screen.queryByRole("button", { name: "Limpar filtros" }),
      ).not.toBeInTheDocument();
    });
  },
);

describe("Dados apresentados nas prévias", () => {
  it("preserva número completo, marcadores, fase interna e situação externa do instrumento", () => {
    // Given
    const item = criarConvenioTeste({
      numero: "25000000145202699",
      numeroInstrumento: "12345/2026",
      equipamentos: [
        criarMarcadorTeste("Mamógrafo", true),
        criarMarcadorTeste("Cadeira hospitalar"),
      ],
      municipio: "ANÁPOLIS",
      uf: "GO",
      situacao: "Prestação de Contas Concluída",
    });
    item.financeiro.global = 0;
    // When
    render(
      <RelatorioRegistrosTabela
        itens={[
          item,
          criarConvenioTeste({ numero: "QA002", cnes: null, situacao: "" }),
        ].map((c) =>
          linhaDeConvenio(c, new Map([[item.numero, "Em instalação"]])),
        )}
      />,
    );
    // Then
    const tabela = within(screen.getByRole("table"));
    expect(tabela.getByText(item.numero)).toBeInTheDocument();
    expect(
      tabela.getByText("Mamógrafo, Cadeira hospitalar"),
    ).toBeInTheDocument();
    expect(
      tabela.getByText("Prestação de Contas Concluída"),
    ).toBeInTheDocument();
    expect(tabela.getByText("Em instalação")).toBeInTheDocument();
    expect(tabela.getByText("Anápolis/GO")).toBeInTheDocument();
    expect(tabela.getByText("2026")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 0")).toHaveLength(2);
    expect(screen.getByText("Equipamento não informado")).toBeInTheDocument();
    expect(screen.getByText("Ano —")).toBeInTheDocument();
  });

  it("exibe parceria e situação financeira capturada sem substituir a situação ausente por um palpite", () => {
    // Given
    const confirmada = criarPropostaPrevia(1, {
      tem_parceria: true,
      cd_parceria: "QA-PARCERIA",
      vl_global_proposta: 0,
      metas_resumo: {
        timeline_financeira: {
          ordens_pagamento: [{ in_situacao_op: "Pago conforme fonte" }],
        },
      },
    });
    const semDados = criarPropostaPrevia(2, {
      situacao_proposta: null,
      municipio: null,
      uf: null,
      data_proposta: null,
    });
    // When
    render(
      <RelatorioRegistrosTabela itens={[confirmada, semDados].map(proposta)} />,
    );
    // Then
    const tabela = within(screen.getByRole("table"));
    expect(tabela.getByText("QA-PARCERIA")).toBeInTheDocument();
    expect(tabela.getByText("1002")).toBeInTheDocument();
    expect(tabela.getByText("Pago conforme fonte")).toBeInTheDocument();
    expect(tabela.getAllByText("2026").length).toBeGreaterThan(0);
    expect(tabela.getByText("Salvador/BA")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 0")).toHaveLength(2);
    expect(tabela.getAllByText("—").length).toBeGreaterThan(0);
  });
});

it("identifica o filtro sem seleção como Todos os Equipamentos em Oncologia", () => {
  const { result } = renderHook(useRelatorioInstrumentosFiltros);
  const opcoes = {
    tipo: [],
    monitorado: [],
    uf: [],
    municipio: [],
    cnes: [],
    equipamento: [],
    situacao: [],
    programa: [],
    ano: [],
  };
  const controle = montarControlesRelatorio(result.current, opcoes).find(
    (c) => c.rotulo === "Equipamento",
  )!;
  render(controle.conteudo(() => {}));
  expect(
    screen.getByRole("button", { name: "Todos os Equipamentos em Oncologia" }),
  ).toBeInTheDocument();
});
