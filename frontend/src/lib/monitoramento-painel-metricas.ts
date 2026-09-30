import { nomePrioritarioCanonico } from "@/lib/equipamento-catalogo";
import { diasAte } from "@/lib/monitoramento-format";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import type {
  ContagemRotulo,
  ResumoMonitoramento,
} from "@/services/monitoramento-resumo";
import type { ConvenioUnificado } from "@/types/monitoramento";
import { normalizarTexto } from "@/utils/texto";

function extrairFamilia(descricao: string | null): string {
  if (!descricao) return "Não informado";
  const prioritario = nomePrioritarioCanonico(descricao);
  if (prioritario) return prioritario;
  const texto = normalizarTexto(descricao);
  if (texto.includes("tomograf")) return "Tomógrafo";
  if (texto.includes("ressonancia")) return "Ressonância Magnética";
  if (texto.includes("ultrasson") || texto.includes("ultrasom"))
    return "Ultrassom";
  if (texto.includes("endoscopia")) return "Endoscopia";
  if (texto.includes("cintilograf") || texto.includes("gama probe"))
    return "Medicina Nuclear";
  return "Outro";
}

function contar(rotulos: string[]): ContagemRotulo[] {
  const mapa = new Map<string, number>();
  for (const rotulo of rotulos) mapa.set(rotulo, (mapa.get(rotulo) ?? 0) + 1);
  return [...mapa]
    .map(([rotulo, quantidade]) => ({ rotulo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/** Média da referência de fase sobre todo o recorte; ausência de marco = 0%. */
export function mediaReferenciaFase(
  instrumentos: Array<Pick<InstrumentoEquipamento, "nr_convenio">>,
  indicadores: ResumoMonitoramento["indicadores_por_instrumento"],
): number | null {
  if (!instrumentos.length) return null;
  const numeros = new Set(instrumentos.map((item) => item.nr_convenio));
  const soma = indicadores.reduce(
    (total, item) =>
      total +
      (numeros.has(item.nr_convenio) ? (item.pct_referencia_fase ?? 0) : 0),
    0,
  );
  return soma / instrumentos.length;
}

export function montarMetricasPainel(
  instrumentos: InstrumentoEquipamento[],
  resumo: ResumoMonitoramento,
  convenios: ConvenioUnificado[],
) {
  const numeros = new Set(instrumentos.map((item) => item.nr_convenio));
  const conveniosPorNumero = new Map(
    convenios.map((item) => [item.numero, item]),
  );
  const indicadores = resumo.indicadores_por_instrumento.filter((item) =>
    numeros.has(item.nr_convenio),
  );
  const licencas = resumo.licencas_vencendo.filter((item) =>
    numeros.has(item.nr_convenio),
  );
  const inauguracoes = resumo.inauguracoes.filter((item) =>
    numeros.has(item.nr_convenio),
  );
  const divergencias = resumo.divergencias_conclusao.filter((item) =>
    numeros.has(item.nr_convenio),
  );
  const acoes = resumo.acoes_em_aberto.filter((item) =>
    numeros.has(item.nr_convenio),
  );

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

  const pcts = indicadores
    .map((item) => item.pct_referencia_fase)
    .filter((valor): valor is number => valor != null);
  const acoesPendentes = indicadores.reduce(
    (soma, item) => soma + item.acoes_pendentes,
    0,
  );
  const acoesAtrasadas = indicadores.reduce(
    (soma, item) => soma + item.acoes_atrasadas,
    0,
  );
  const licencasCriticas = licencas.filter((item) => item.dias < 90);
  const inauguracoesAtrasadas = inauguracoes.filter(
    (item) => !item.realizada && item.dias < 0,
  );
  const numerosEmAtencao = new Set([
    ...indicadores
      .filter((item) => item.acoes_atrasadas > 0)
      .map((item) => item.nr_convenio),
    ...licencasCriticas.map((item) => item.nr_convenio),
    ...inauguracoesAtrasadas.map((item) => item.nr_convenio),
    ...divergencias.map((item) => item.nr_convenio),
  ]);
  const inauguracoesPorAno = new Map<
    string,
    { realizadas: number; previstas: number }
  >();
  for (const item of inauguracoes) {
    // Uma previsão vencida pertence à agenda crítica, não à série futura.
    if (!item.realizada && item.dias < 0) continue;
    const ano = item.data.slice(0, 4);
    const faixa = inauguracoesPorAno.get(ano) ?? {
      realizadas: 0,
      previstas: 0,
    };
    if (item.realizada) faixa.realizadas += 1;
    else faixa.previstas += 1;
    inauguracoesPorAno.set(ano, faixa);
  }

  return {
    numeros,
    licencas,
    inauguracoes,
    divergencias,
    acoes,
    acoesPendentes,
    acoesAtrasadas,
    licencasDeferidas: indicadores.filter((item) => item.licenca_cnen_deferida)
      .length,
    // Sem marco de fase, o instrumento aparece como "Não iniciado" (0%).
    // Incluir esses casos evita a média inflada dos apenas já movimentados.
    pctReferenciaMedio: mediaReferenciaFase(instrumentos, indicadores),
    pctsComReferencia: pcts.length,
    licencasCriticas: licencasCriticas.length,
    inauguracoesAtrasadas: inauguracoesAtrasadas.length,
    pontosAtencao:
      acoesAtrasadas +
      licencasCriticas.length +
      inauguracoesAtrasadas.length +
      divergencias.length,
    instrumentosEmAtencao: numerosEmAtencao.size,
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
    porTipo: [...valoresPorTipo]
      .map(([rotulo, dados]) => ({ rotulo, ...dados }))
      .sort((a, b) => b.valor - a.valor),
    fases: contar(
      instrumentos.map((item) => item.fase_atual ?? "Não iniciado"),
    ),
    porEquipamento: contar(
      instrumentos.map((item) => extrairFamilia(item.equipamento_descricao)),
    ),
    porTecnico: contar(
      instrumentos.map((item) => item.tecnico_titular ?? "Não informado"),
    ),
    semTecnico: instrumentos.filter((item) => !item.tecnico_titular).length,
    semCnes: instrumentos.filter((item) => !item.cnes).length,
    semCoordenadas: instrumentos.filter(
      (item) =>
        item.latitude == null ||
        item.longitude == null ||
        !Number.isFinite(item.latitude) ||
        !Number.isFinite(item.longitude) ||
        Math.abs(item.latitude) > 90 ||
        Math.abs(item.longitude) > 180,
    ).length,
    semAno: instrumentos.filter((item) => item.ano_instrumento == null).length,
    inauguracoesPorAno: [...inauguracoesPorAno]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ano, dados]) => ({ ano, ...dados })),
    previsoesVencidasForaDaSerie: inauguracoesAtrasadas.length,
  };
}
