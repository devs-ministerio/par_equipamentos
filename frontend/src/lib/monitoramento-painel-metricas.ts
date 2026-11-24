import { rotulosEquipamentoDoInstrumento } from "@/lib/monitoramento-filtro-equipamentos";
import { agregarValoresPainel } from "@/lib/monitoramento-painel-valores";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import type {
  ContagemRotulo,
  ResumoMonitoramento,
} from "@/services/monitoramento-resumo";
import type { ConvenioUnificado } from "@/types/monitoramento";

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
  const lacunas = resumo.lacunas_conclusao.filter((item) =>
    numeros.has(item.nr_convenio),
  );
  const divergencias = resumo.divergencias_conclusao.filter((item) =>
    numeros.has(item.nr_convenio),
  );
  const acoes = resumo.acoes_em_aberto.filter((item) =>
    numeros.has(item.nr_convenio),
  );

  const valores = agregarValoresPainel(instrumentos, conveniosPorNumero);

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
    lacunas,
    acoes,
    acoesPendentes,
    acoesAtrasadas,
    licencasDeferidas: indicadores.filter((item) => item.licenca_cnen_deferida)
      .length,
    // Sem marco de fase, o instrumento aparece como "Acompanhamento iniciado" (0%).
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
    ...valores,
    fases: contar(
      instrumentos.map((item) => item.fase_atual ?? "Acompanhamento iniciado"),
    ),
    // Conta instrumentos por equipamento, pelos marcadores canônicos (mesma fonte do filtro). Instrumento com
    // mais de um equipamento entra em cada um, então esta distribuição pode somar mais que o total de instrumentos.
    porEquipamento: contar(
      instrumentos.flatMap((item) => {
        const rotulos = rotulosEquipamentoDoInstrumento(
          conveniosPorNumero.get(item.nr_convenio)?.equipamentos,
        );
        return rotulos.length ? rotulos : ["Não informado"];
      }),
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
