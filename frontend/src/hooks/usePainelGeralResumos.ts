import { useQueries } from "@tanstack/react-query";
import {
  fetchEquipmentTotals,
  fetchHealthRegionCoverage,
  fetchLegalNatureBreakdown,
  fetchMacroCoverage,
  fetchMunicipalityCoverage,
} from "@/services/api";
import type { NaturezaJuridicaBreakdown } from "@/services/api";
import { REGIOES } from "@/data/constants";
import type { CoberturaRow, Macrorregiao, Regiao } from "@/types/domain";

// Corte de 100 mil habitantes usado pro card "Municípios Hipossuficientes" --
// mesmo criterio (e mesma ressalva: especifico do parametro do TOMOGRAFO, ver
// NivelCoberturaTable.tsx) do card equivalente no Dashboard, replicado aqui
// pro resumo nacional bater com o numero que o usuario ve ao entrar na
// familia.
const POPULACAO_MINIMA_HIPO = 100_000;

export interface MacroRankItem {
  macroId: string;
  nome: string;
  uf: string;
  cobertura: number;
}

interface RegiaoBreakdown {
  regiao: Regiao;
  hipo: number;
  total: number;
}

export interface ResumoFamilia {
  familia: string;
  totalSus: number;
  totalGeral: number;
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
  macrosHipo: number;
  macrosTotal: number;
  municipiosHipo: number;
  /** Municipios com >=100 mil hab. (o universo elegivel pro corte de Hipo,
   * ver POPULACAO_MINIMA_HIPO) -- so pra calcular a PROPORCAO de gravidade
   * do card de Cobertura, o numero mostrado continua sendo so municipiosHipo
   * (contagem absoluta, decisao original mantida). */
  municipiosTotal: number;
  regioesHipo: number;
  regioesTotal: number;
  /** 5 macros com a pior e com a melhor cobertura -- "onde focar primeiro"
   * (hipo) e "onde tem folga de sobra" (hiper), nao so "quantas tem
   * problema". Sem filtrar por status: hiper e literalmente as 5 de maior
   * cobertura, mesmo que status ja fosse Hiperssuficiente de sobra. */
  top5Hipo: MacroRankItem[];
  top5Hiper: MacroRankItem[];
  /** Contagem de macros Hipo/total por Grande Regiao (Norte/Nordeste/...) --
   * a contagem nacional sozinha esconde desigualdade regional. */
  porRegiao: RegiaoBreakdown[];
  naturezaJuridica: NaturezaJuridicaBreakdown[];
}

export type EstadoResumo = ResumoFamilia | "carregando" | "erro";

async function buscarResumoFamilia(familia: string): Promise<ResumoFamilia> {
  const [coverage, totais, municipios, regioes, natureza] = await Promise.all([
    fetchMacroCoverage(familia),
    fetchEquipmentTotals({ equipmentFamily: familia }),
    fetchMunicipalityCoverage({
      equipmentFamily: familia,
      minPopulation: POPULACAO_MINIMA_HIPO,
    }),
    fetchHealthRegionCoverage({ equipmentFamily: familia }),
    fetchLegalNatureBreakdown(familia),
  ]);

  const macroById = new Map(coverage.macros.map((m) => [m.id, m]));

  const comMacro = coverage.coberturaRows
    .map((r) => ({ row: r, macro: macroById.get(r.macroId) }))
    .filter((x): x is { row: CoberturaRow; macro: Macrorregiao } =>
      Boolean(x.macro),
    );
  const paraItem = ({
    row,
    macro,
  }: {
    row: CoberturaRow;
    macro: Macrorregiao;
  }): MacroRankItem => ({
    macroId: row.macroId,
    nome: macro.nome,
    uf: macro.uf,
    cobertura: row.cobertura,
  });
  const top5Hipo = comMacro
    .filter((x) => x.row.status === "Hipossuficiente")
    .sort((a, b) => a.row.cobertura - b.row.cobertura)
    .slice(0, 5)
    .map(paraItem);
  const top5Hiper = comMacro
    .slice()
    .sort((a, b) => b.row.cobertura - a.row.cobertura)
    .slice(0, 5)
    .map(paraItem);

  const porRegiaoMap = new Map<Regiao, { hipo: number; total: number }>();
  coverage.coberturaRows.forEach((r) => {
    const macro = macroById.get(r.macroId);
    if (!macro) return;
    const atual = porRegiaoMap.get(macro.regiao) ?? { hipo: 0, total: 0 };
    atual.total += 1;
    if (r.status === "Hipossuficiente") atual.hipo += 1;
    porRegiaoMap.set(macro.regiao, atual);
  });
  const porRegiao: RegiaoBreakdown[] = REGIOES.map((regiao) => ({
    regiao,
    ...(porRegiaoMap.get(regiao) ?? { hipo: 0, total: 0 }),
  }));

  return {
    familia,
    totalSus: totais.availableQty,
    totalGeral: totais.existingQty,
    macros: coverage.macros,
    coberturaRows: coverage.coberturaRows,
    macrosHipo: coverage.coberturaRows.filter(
      (r) => r.status === "Hipossuficiente",
    ).length,
    macrosTotal: coverage.coberturaRows.length,
    municipiosHipo: municipios.filter((r) => r.status === "Hipossuficiente")
      .length,
    municipiosTotal: municipios.length,
    regioesHipo: regioes.filter((r) => r.status === "Hipossuficiente").length,
    regioesTotal: regioes.length,
    top5Hipo,
    top5Hiper,
    porRegiao,
    naturezaJuridica: natureza,
  };
}

/**
 * Resumo (totais + hipo/hiper) de cada familia `disponivel`, buscado em
 * paralelo -- migrado de `useEffect`+`setState` manual pra `useQueries`
 * (2026-09-11): a lista de familias e uma constante de modulo
 * (`EQUIPAMENTOS.filter(disponivel)`), mas o numero de queries ainda
 * depende de dado (o array passado), entao `useQueries` (nao varias
 * chamadas de `useQuery` em loop) e quem lida com isso corretamente.
 */
export function usePainelGeralResumos(
  familias: string[],
): Record<string, EstadoResumo> {
  const queries = useQueries({
    queries: familias.map((familia) => ({
      queryKey: ["painel-geral-resumo", familia],
      queryFn: () => buscarResumoFamilia(familia),
    })),
  });

  const resumos: Record<string, EstadoResumo> = {};
  familias.forEach((familia, i) => {
    const q = queries[i];
    if (q.isPending) resumos[familia] = "carregando";
    else if (q.isError) resumos[familia] = "erro";
    else resumos[familia] = q.data as ResumoFamilia;
  });
  return resumos;
}
