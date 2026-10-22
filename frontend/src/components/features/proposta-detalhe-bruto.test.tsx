import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DetalheBrutoProposta } from "./proposta-detalhe-bruto";

function criarAnalise() {
  return {
    in_resultado_analise: "Aprovado",
    in_fase_analise: "Fase sintética",
    tipos_analise: [{ tp_analise: "Técnica" }, {}],
    dh_analise_proposta: "2026-10-20T12:00:00",
    ds_parecer: "<img src=x> Parecer sintético",
  };
}
function criarMeta() {
  return {
    nm_meta: "Meta sintética",
    etapas_proposta: [
      {
        nm_etapa: "Etapa sintética",
        dt_inicio: "2026-10-01T00:00:00",
        dt_fim: "2026-10-20",
        itens: [
          {
            nm_item: "<b>Item sintético</b>",
            ds_item: "Descrição da fonte",
            qt_quantidade: 2,
            vl_unitario_item: 100,
            vl_total_item: 200,
          },
          { qt_quantidade: 0, vl_unitario_item: 0, vl_total_item: 0 },
          {},
        ],
      },
    ],
  };
}
afterEach(cleanup);

describe("Detalhes oficiais capturados de uma proposta", () => {
  it("mantém o detalhe utilizável quando parcelas têm entradas nulas ou campos de tipo inesperado", () => {
    // Given
    const dados = {
      cronograma_desembolso: [
        null,
        {
          nr_ref_mes_data_especif: {},
          nr_ref_ano_data_especif: {},
          vl_cronograma_desembolso: "valor inválido",
        },
      ],
    };
    // When
    render(<DetalheBrutoProposta metasResumo={dados} />);
    // Then
    expect(
      screen.getByRole("heading", {
        name: /Cronograma de desembolso previsto/,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("—/—")).toHaveLength(2);
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it.each([
    null,
    undefined,
    "texto",
    42,
    {},
    { proposta: [], metas: "inválido", cronograma_desembolso: {} },
  ])(
    "não inventa seções para dados ausentes ou inválidos: %j",
    (metasResumo) => {
      // Given / When
      const { container } = render(
        <DetalheBrutoProposta metasResumo={metasResumo} />,
      );
      // Then
      expect(container).toBeEmptyDOMElement();
    },
  );

  it("exibe parecer mesmo quando a captura só contém análise técnica", () => {
    // Given
    const dados = { analise: [criarAnalise(), {}] };
    // When
    const { container } = render(<DetalheBrutoProposta metasResumo={dados} />);
    // Then
    expect(screen.getByText("Análise técnica (parecer)")).toBeInTheDocument();
    expect(
      screen.getByText("<img src=x> Parecer sintético"),
    ).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/20\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Técnica/)).toBeInTheDocument();
    expect(
      screen.queryByText("Timeline financeira (pós-parceria)"),
    ).not.toBeInTheDocument();
  });

  it("exibe origem do recurso isolada e preserva emenda, autor e zero", () => {
    // Given
    const dados = {
      distribuicao_recurso: [
        {
          in_tipo_distribuicao: "Emenda",
          nr_emenda_proposta: "QA001",
          nm_parlamentar_proposta: "Autor sintético",
          in_tipo_emenda_parlamentar_proposta: "Individual",
          valor_emenda: 0,
        },
        {},
        { nm_parlamentar_proposta: "Outro autor", valor_emenda: 100 },
      ],
    };
    // When
    render(<DetalheBrutoProposta metasResumo={dados} />);
    // Then
    expect(screen.getByText("Origem do recurso")).toBeInTheDocument();
    expect(screen.getByText("QA001")).toBeInTheDocument();
    expect(
      screen.getByText("Autor sintético (Individual)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Outro autor")).toBeInTheDocument();
    expect(screen.getByText("R$ 0")).toBeInTheDocument();
    expect(screen.getByText("R$ 100")).toBeInTheDocument();
  });

  it("exibe parceria isolada, mas não chama cronograma previsto de execução financeira", () => {
    // Given
    const dados = {
      parceria: {
        cd_parceria: 123,
        id_parceria: 1,
        in_situacao_parceria: "Situação da fonte",
      },
    };
    // When
    render(<DetalheBrutoProposta metasResumo={dados} />);
    // Then
    expect(
      screen.getByText("Timeline financeira (pós-parceria)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Situação da fonte")).toBeInTheDocument();
    expect(
      screen.queryByText("Cronograma de desembolso previsto"),
    ).not.toBeInTheDocument();
  });

  it("apresenta identificação e textos longos literalmente, removendo campos ausentes na atualização", () => {
    // Given
    const dados = {
      proposta: {
        nm_natureza_juridica: "Natureza sintética",
        nm_unidade_gestora: "Unidade sintética",
        ed_logradouro: "Rua sintética",
        ed_numero: "10",
        ed_complemento: "Bloco A",
        ed_bairro: "Centro",
        ed_cep: "00000-000",
        ds_problema_proposta: "<script>Texto público</script>",
        ds_resultado_esperado_proposta: "Resultado sintético",
        ds_publico_alvo_proposta: "Público sintético",
      },
    };
    const { container, rerender } = render(
      <DetalheBrutoProposta metasResumo={dados} />,
    );
    // When
    expect(
      screen.getByText("Rua sintética, 10, Bloco A, Centro, 00000-000"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("<script>Texto público</script>"),
    ).toBeInTheDocument();
    expect(screen.getByText("Resultado sintético")).toBeInTheDocument();
    expect(screen.getByText("Público sintético")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    rerender(
      <DetalheBrutoProposta
        metasResumo={{ proposta: { nm_unidade_gestora: "Outra unidade" } }}
      />,
    );
    // Then
    expect(screen.getByText("Outra unidade")).toBeInTheDocument();
    expect(screen.queryByText("Natureza jurídica")).not.toBeInTheDocument();
    expect(screen.queryByText("Problema a resolver")).not.toBeInTheDocument();
    expect(screen.queryByText("Endereço")).not.toBeInTheDocument();
  });

  it("preserva itens da meta nas estruturas desktop e móvel, diferenciando zero e ausência", () => {
    // Given
    const dados = {
      metas: [
        criarMeta(),
        { cd_meta: "QA2", etapas_proposta: [{ itens: [] }] },
        {},
      ],
    };
    // When
    const { container } = render(<DetalheBrutoProposta metasResumo={dados} />);
    // Then
    expect(screen.getByText("Meta sintética")).toBeInTheDocument();
    expect(screen.getByText("Meta #QA2")).toBeInTheDocument();
    expect(screen.getByText("Meta #3")).toBeInTheDocument();
    expect(
      screen.getByText(/Etapa sintética \(01\/10\/2026 → 20\/10\/2026\)/),
    ).toBeInTheDocument();
    const tabela = within(screen.getByRole("table"));
    const linhas = tabela.getAllByRole("row");
    expect(linhas).toHaveLength(4);
    expect(linhas[1]).toHaveTextContent("<b>Item sintético</b>2R$ 100R$ 200");
    expect(linhas[2]).toHaveTextContent("—0R$ 0R$ 0");
    expect(linhas[3]).toHaveTextContent("————");
    expect(screen.getAllByText("<b>Item sintético</b>")).toHaveLength(2);
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByTitle("Descrição da fonte")).toBeInTheDocument();
  });

  it("mostra mês e valor previstos sem assumir número para campos inválidos", () => {
    // Given
    const dados = {
      cronograma_desembolso: [
        {
          nr_ref_mes_data_especif: "1",
          nr_ref_ano_data_especif: 2027,
          vl_cronograma_desembolso: 100,
          origem_recurso: "Fonte sintética",
        },
        { nr_ref_mes_data_especif: 99, vl_cronograma_desembolso: "999" },
        { vl_cronograma_desembolso: 0 },
      ],
    };
    // When
    render(<DetalheBrutoProposta metasResumo={dados} />);
    // Then
    expect(
      screen.getByRole("heading", {
        name: /Cronograma de desembolso previsto/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jan/2027")).toBeInTheDocument();
    expect(screen.getAllByText("—/—")).toHaveLength(2);
    expect(screen.getByText("R$ 100")).toBeInTheDocument();
    expect(screen.getByText("R$ 0")).toBeInTheDocument();
    expect(screen.getByText("Fonte sintética")).toBeInTheDocument();
    expect(
      screen.queryByText("Timeline financeira (pós-parceria)"),
    ).not.toBeInTheDocument();
  });
});
