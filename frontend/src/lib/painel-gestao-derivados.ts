import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { montarMetricasPainel } from "@/lib/monitoramento-painel-metricas";
import { resumirCarteiraPainel } from "@/lib/monitoramento-painel-analise";
import {
  equipamentosPorSituacao,
  totaisOperacao,
} from "@/lib/painel-gestao-operacao";
import {
  entregaInauguracaoPorAno,
  entregaPorUf,
} from "@/lib/painel-gestao-entrega";
import {
  faixaDeAtualizacao,
  instrumentosParados,
} from "@/lib/painel-gestao-atualizacao";
import { instrumentosDoPrazo, prazosMedios } from "@/lib/painel-gestao-prazos";
import {
  situacaoDoInstrumento,
  situacaoInauguracao,
} from "@/lib/painel-gestao-andamento";

export type FiltroLocal = "familia" | "inauguracao" | "atualizacao" | "prazo";
export type FiltrosLocais = Partial<Record<FiltroLocal, string>>;

export const ROTULO_FILTRO_LOCAL: Record<FiltroLocal, string> = {
  familia: "Família no gráfico",
  inauguracao: "Inauguração",
  atualizacao: "Sem atualizações",
  prazo: "Prazo entre etapas",
};

type Resumo = Parameters<typeof montarMetricasPainel>[1];
type Convenios = Parameters<typeof montarMetricasPainel>[2];
type Instrumento = Parameters<typeof montarMetricasPainel>[0][number] & {
  fase_atual?: string | null;
};

/** Aplica os filtros locais dos gráficos (família, inauguração, atualização, prazo) sobre o recorte da página. */
export function aplicarFiltrosLocais<T extends Instrumento>(
  base: T[],
  resumo: Resumo,
  locais: FiltrosLocais,
): T[] {
  const etapaPorNumero = new Map(
    resumo.etapas_por_instrumento.map((e) => [e.nr_convenio, e]),
  );
  const ultimaAtividade = new Map(
    resumo.indicadores_por_instrumento.map((i) => [
      i.nr_convenio,
      i.ultima_atividade_em,
    ]),
  );
  const comPrevisao = new Set(resumo.inauguracoes.map((i) => i.nr_convenio));
  const familiasDoNumero = new Map<string, Set<string>>();
  for (const l of resumo.equipamentos_por_instrumento) {
    const atual = familiasDoNumero.get(l.nr_convenio) ?? new Set<string>();
    atual.add(l.familia);
    familiasDoNumero.set(l.nr_convenio, atual);
  }
  const numerosDoPrazo = locais.prazo
    ? instrumentosDoPrazo(
        locais.prazo,
        new Set(base.map((i) => i.nr_convenio)),
        resumo.etapas_por_instrumento,
      )
    : null;
  return base.filter((i) => {
    const n = i.nr_convenio;
    if (locais.familia && !familiasDoNumero.get(n)?.has(locais.familia))
      return false;
    if (
      locais.inauguracao &&
      situacaoDoInstrumento(etapaPorNumero.get(n), comPrevisao.has(n)) !==
        locais.inauguracao
    )
      return false;
    if (
      locais.atualizacao &&
      faixaDeAtualizacao(i.fase_atual, ultimaAtividade.get(n)) !==
        locais.atualizacao
    )
      return false;
    if (numerosDoPrazo && !numerosDoPrazo.has(n)) return false;
    return true;
  });
}

/** Todas as séries e totais que os gráficos do painel de gestão consomem. */
export function derivarPainel<T extends Instrumento>(
  instrumentos: T[],
  resumo: Resumo,
  convenios: Convenios,
) {
  const fases = [...FASES_ACOMPANHAMENTO];
  const numeros = new Set(instrumentos.map((i) => i.nr_convenio));
  const familias = equipamentosPorSituacao(
    resumo.equipamentos_por_instrumento,
    numeros,
    resumo.etapas_por_instrumento,
  );
  const entregaAno = entregaInauguracaoPorAno(
    numeros,
    resumo.etapas_por_instrumento,
  );
  return {
    fases,
    total: instrumentos.length,
    dados: montarMetricasPainel(instrumentos, resumo, convenios),
    analise: resumirCarteiraPainel(instrumentos, fases),
    familias,
    equipamentos: totaisOperacao(familias),
    entregaAno,
    totalEntregaAno: entregaAno.anos.reduce(
      (t, a) => t + a.inaugurados + a.dispensados,
      0,
    ),
    situacaoInaug: situacaoInauguracao(
      numeros,
      resumo.etapas_por_instrumento,
      new Set(resumo.inauguracoes.map((i) => i.nr_convenio)),
    ),
    parados: instrumentosParados(
      instrumentos,
      resumo.indicadores_por_instrumento.filter((i) =>
        numeros.has(i.nr_convenio),
      ),
    ),
    prazos: prazosMedios(numeros, resumo.etapas_por_instrumento),
    porUf: entregaPorUf(
      instrumentos,
      resumo.equipamentos_por_instrumento,
      resumo.etapas_por_instrumento,
    ),
  };
}

export type PainelDerivado = ReturnType<typeof derivarPainel>;
