import { describe, expect, it, vi } from "vitest";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";
import type { ConvenioUnificado } from "@/types/monitoramento";
import {
  mediaReferenciaFase,
  montarMetricasPainel,
} from "./monitoramento-painel-metricas";

const instrumento = (nr_convenio: string) =>
  ({
    nr_convenio,
    tipo_contratacao: "Convênio",
    equipamento_descricao: "Tomógrafo",
    tecnico_titular: "Ana",
    fase_atual: "Concluído",
    cnes: "1234567",
    latitude: -15,
    longitude: -47,
    ano_instrumento: 2025,
  }) as InstrumentoEquipamento;

const convenio = (numero: string, global: number, pago: number | null) =>
  ({
    numero,
    financeiro: { global, fonteConfiavel: true },
    valorPagoFornecedor: pago,
  }) as ConvenioUnificado;

const resumo: ResumoMonitoramento = {
  total_instrumentos: 2,
  pct_execucao_fisica_medio: 0.5,
  distribuicao_fase: [],
  licencas_cnen_deferidas: 1,
  licencas_vencendo: [
    {
      nr_convenio: "1",
      nome_convenente: "A",
      data_validade: "2026-10-20",
      dias: 21,
    },
  ],
  por_tecnico_titular: [],
  inauguracoes: [
    {
      nr_convenio: "1",
      nome_convenente: "A",
      municipio: null,
      uf: null,
      equipamento: null,
      data: "2025-08-20",
      realizada: true,
      dias: -405,
    },
    {
      nr_convenio: "2",
      nome_convenente: "B",
      municipio: null,
      uf: null,
      equipamento: null,
      data: "2027-04-20",
      realizada: false,
      dias: 203,
    },
  ],
  acoes_pendentes: 2,
  acoes_atrasadas: 1,
  nr_convenios: ["1", "2"],
  divergencias_conclusao: [],
  divergencias_conclusao_por_fonte: [],
  indicadores_por_instrumento: [
    {
      nr_convenio: "1",
      acoes_pendentes: 1,
      acoes_atrasadas: 1,
      licenca_cnen_deferida: true,
      pct_referencia_fase: 0.8,
      ultima_atividade_em: null,
    },
    {
      nr_convenio: "2",
      acoes_pendentes: 1,
      acoes_atrasadas: 0,
      licenca_cnen_deferida: false,
      pct_referencia_fase: 0.4,
      ultima_atividade_em: null,
    },
  ],
  acoes_em_aberto: [],
  fila_acoes_truncada: false,
  gerado_em: "2026-09-29T00:00:00Z",
};

describe("montarMetricasPainel", () => {
  it("calcula a média referencial somente para o recorte solicitado", () => {
    expect(
      mediaReferenciaFase(
        [instrumento("1")],
        resumo.indicadores_por_instrumento,
      ),
    ).toBeCloseTo(0.8);
    expect(
      mediaReferenciaFase(
        [instrumento("3")],
        resumo.indicadores_por_instrumento,
      ),
    ).toBe(0);
    expect(
      mediaReferenciaFase([], resumo.indicadores_por_instrumento),
    ).toBeNull();
  });
  it("não converte pagamento desconhecido em zero e usa só base comparável", () => {
    const dados = montarMetricasPainel(
      [instrumento("1"), instrumento("2")],
      resumo,
      [convenio("1", 100, 40), convenio("2", 200, null)],
    );
    expect(dados.valorGlobal).toBe(300);
    expect(dados.percentualPago).toBe(0.4);
    expect(dados.instrumentosComPagamento).toBe(1);
    expect(dados.instrumentosEmAtencao).toBe(1);
    expect(dados.pontosAtencao).toBe(2);
  });

  it("agrega o recorte sem emprestar ações de outro instrumento", () => {
    const dados = montarMetricasPainel([instrumento("2")], resumo, [
      convenio("2", 200, null),
    ]);
    expect(dados.acoesAtrasadas).toBe(0);
    expect(dados.licencasDeferidas).toBe(0);
    expect(dados.percentualPago).toBeNull();
    expect(dados.pontosAtencao).toBe(0);
  });

  it("inclui instrumentos sem marco como 0% na média referencial da carteira", () => {
    const dados = montarMetricasPainel(
      [instrumento("1"), instrumento("2"), instrumento("3")],
      resumo,
      [],
    );
    expect(dados.pctsComReferencia).toBe(2);
    expect(dados.pctReferenciaMedio).toBeCloseTo(0.4);
  });

  it("não soma valor de fonte financeira marcada como não confiável", () => {
    const naoConfiavel = {
      ...convenio("2", 200, 100),
      financeiro: { global: 200, fonteConfiavel: false },
    } as ConvenioUnificado;
    const dados = montarMetricasPainel(
      [instrumento("1"), instrumento("2")],
      resumo,
      [convenio("1", 100, 40), naoConfiavel],
    );
    expect(dados.valorGlobal).toBe(100);
    expect(dados.instrumentosComValor).toBe(1);
    expect(dados.percentualPago).toBe(0.4);
  });

  it("inclui valor global manual e separa pagamento registrado da quitação por conclusão", () => {
    const manual = {
      ...convenio("2", 200, null),
      desembolsoIntegralDaCarga: true,
      financeiro: { global: 200, fonteConfiavel: false },
    } as ConvenioUnificado;
    const dados = montarMetricasPainel(
      [instrumento("1"), { ...instrumento("2"), tipo_contratacao: "FAF" }],
      resumo,
      [convenio("1", 100, 40), manual],
    );
    expect(dados.valorGlobal).toBe(300);
    expect(dados.instrumentosComValor).toBe(2);
    expect(dados.cargasManuais).toBe(1);
    expect(dados.percentualPago).toBe(0.4);
    expect(dados.percentualPagoComRegra).toBe(0.8);
    expect(dados.pagamentosManuaisConcluidos).toBe(1);
    expect(dados.porTipo.find((item) => item.rotulo === "FAF")?.comValor).toBe(
      1,
    );
  });

  it("só presume quitação integral da carga manual quando a fase está concluída", () => {
    const manual = {
      ...convenio("2", 200, null),
      desembolsoIntegralDaCarga: true,
      financeiro: { global: 200, fonteConfiavel: false },
    } as ConvenioUnificado;
    const dados = montarMetricasPainel(
      [
        {
          ...instrumento("2"),
          tipo_contratacao: "FAF",
          fase_atual: "Execução",
        },
      ],
      resumo,
      [manual],
    );
    expect(dados.valorGlobal).toBe(200);
    expect(dados.pagamentosManuaisConcluidos).toBe(0);
    expect(dados.percentualPagoComRegra).toBeNull();
  });

  it("inclui somente vigências futuras até o 90º dia, respeitando o recorte", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    try {
      const convenios = [
        { ...convenio("1", 100, 40), datas: { fimVigencia: "2026-12-28" } },
        { ...convenio("2", 200, null), datas: { fimVigencia: "2026-12-29" } },
        { ...convenio("3", 300, null), datas: { fimVigencia: "2026-09-28" } },
      ] as ConvenioUnificado[];
      const dados = montarMetricasPainel(
        [instrumento("1"), instrumento("2"), instrumento("3")],
        resumo,
        convenios,
      );
      expect(dados.vigenciasProximas).toEqual([
        expect.objectContaining({ nr_convenio: "1", dias: 90 }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("separa realizadas e previstas pelo ano da data de inauguração", () => {
    const dados = montarMetricasPainel(
      [instrumento("1"), instrumento("2")],
      resumo,
      [],
    );
    expect(dados.inauguracoesPorAno).toEqual([
      { ano: "2025", realizadas: 1, previstas: 0 },
      { ano: "2027", realizadas: 0, previstas: 1 },
    ]);
  });
});
