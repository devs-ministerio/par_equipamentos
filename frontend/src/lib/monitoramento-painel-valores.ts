import { diasAte } from "@/lib/monitoramento-format";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import type { ConvenioUnificado } from "@/types/monitoramento";

/** Valores, pagamentos, vigências e agrupamentos financeiros do recorte. */
export function agregarValoresPainel(
  instrumentos: InstrumentoEquipamento[],
  conveniosPorNumero: Map<string, ConvenioUnificado>,
) {
  let valorGlobal = 0;
  let valorGlobalComparavel = 0;
  let valorPagoComparavel = 0;
  let valorGlobalComRegraPagamento = 0;
  let valorPagoComRegraPagamento = 0;
  let instrumentosComValor = 0;
  let instrumentosComPagamento = 0;
  let pagamentosManuaisConcluidos = 0;
  let cargasManuais = 0;
  const vigenciasProximas: Array<{
    nr_convenio: string;
    nome_convenente: string;
    data_final: string;
    dias: number;
  }> = [];
  const valoresPorTipo = new Map<
    string,
    { quantidade: number; comValor: number; valor: number }
  >();
  const valoresPorFase = new Map<string, number>();
  for (const instrumento of instrumentos) {
    const convenio = conveniosPorNumero.get(instrumento.nr_convenio);
    if (convenio?.desembolsoIntegralDaCarga) cargasManuais += 1;
    const fimVigencia = convenio?.datas?.fimVigencia;
    const diasVigencia = diasAte(fimVigencia);
    if (
      fimVigencia &&
      diasVigencia != null &&
      diasVigencia >= 0 &&
      diasVigencia <= 90
    ) {
      vigenciasProximas.push({
        nr_convenio: instrumento.nr_convenio,
        nome_convenente: instrumento.nome_convenente,
        data_final: fimVigencia,
        dias: diasVigencia,
      });
    }
    const tipo = instrumento.tipo_contratacao ?? "Não informado";
    const grupo = valoresPorTipo.get(tipo) ?? {
      quantidade: 0,
      comValor: 0,
      valor: 0,
    };
    grupo.quantidade += 1;
    const valor = convenio?.financeiro.global;
    // A carga manual controlada tem valor global válido, embora não tenha
    // detalhamento financeiro oficial. Quitação só é assumida se concluída.
    if (
      convenio &&
      valor != null &&
      Number.isFinite(valor) &&
      valor >= 0 &&
      (convenio.financeiro.fonteConfiavel || convenio.desembolsoIntegralDaCarga)
    ) {
      valorGlobal += valor;
      instrumentosComValor += 1;
      grupo.comValor += 1;
      grupo.valor += valor;
      const fase = instrumento.fase_atual ?? "Acompanhamento iniciado";
      valoresPorFase.set(fase, (valoresPorFase.get(fase) ?? 0) + valor);
      const pago = convenio?.valorPagoFornecedor;
      const pagamentoRegistrado =
        pago != null &&
        Number.isFinite(pago) &&
        pago >= 0 &&
        convenio.financeiro.fonteConfiavel;
      if (
        convenio.desembolsoIntegralDaCarga &&
        instrumento.fase_atual === "Concluído" &&
        valor > 0
      ) {
        // Regra da carga manual concluída: quitação integral ao fornecedor.
        // Convênios oficiais continuam dependendo do pagamento registrado.
        valorGlobalComRegraPagamento += valor;
        valorPagoComRegraPagamento += valor;
        pagamentosManuaisConcluidos += 1;
      } else if (pagamentoRegistrado && valor > 0) {
        valorGlobalComRegraPagamento += valor;
        valorPagoComRegraPagamento += pago;
      }
      if (pagamentoRegistrado && valor > 0) {
        valorGlobalComparavel += valor;
        valorPagoComparavel += pago;
        instrumentosComPagamento += 1;
      }
    }
    valoresPorTipo.set(tipo, grupo);
  }

  return {
    valorGlobal,
    instrumentosComValor,
    instrumentosComPagamento,
    pagamentosManuaisConcluidos,
    cargasManuais,
    vigenciasProximas: vigenciasProximas.sort((a, b) => a.dias - b.dias),
    percentualPago:
      valorGlobalComparavel > 0
        ? valorPagoComparavel / valorGlobalComparavel
        : null,
    percentualPagoComRegra:
      valorGlobalComRegraPagamento > 0
        ? valorPagoComRegraPagamento / valorGlobalComRegraPagamento
        : null,
    valoresPorFase,
    porTipo: [...valoresPorTipo]
      .map(([rotulo, dados]) => ({ rotulo, ...dados }))
      .sort((a, b) => b.valor - a.valor),
  };
}
