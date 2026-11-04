import { useMemo } from "react";
import type { ConvenioUnificado } from "@/types/monitoramento";
import { SITUACOES_INSTRUMENTO_CONCLUIDO } from "@/lib/equipamento-catalogo";

export interface TotalFinanceiro {
  /** Soma dos valores informados; `null` quando nenhum instrumento informou. */
  valor: number | null;
  /** Instrumentos com valor informado (zero informado conta). */
  informados: number;
  total: number;
}

function somaInformada(
  itens: ConvenioUnificado[],
  valorDe: (item: ConvenioUnificado) => number | null,
): TotalFinanceiro {
  let valor = 0;
  let informados = 0;
  for (const item of itens) {
    const v = valorDe(item);
    if (v === null || v === undefined) continue;
    valor += v;
    informados += 1;
  }
  return {
    valor: informados > 0 ? valor : null,
    informados,
    total: itens.length,
  };
}

export function useDadosOficiaisResumo({
  itens,
  monitorados,
  situacaoExibida,
  pagina,
  pageSize,
}: {
  itens: ConvenioUnificado[];
  monitorados: Set<string>;
  situacaoExibida: (item: ConvenioUnificado) => string | null;
  pagina: number;
  pageSize: number;
}) {
  const ordenados = useMemo(
    () =>
      [...itens].sort(
        (a, b) =>
          Number(monitorados.has(b.numero)) - Number(monitorados.has(a.numero)),
      ),
    [itens, monitorados],
  );
  return useMemo(
    () => ({
      paginados: ordenados.slice((pagina - 1) * pageSize, pagina * pageSize),
      // Soma só valores informados; ausência não vira R$ 0 (D18).
      totalGlobal: somaInformada(ordenados, (item) => item.financeiro.global),
      totalDesembolsado: somaInformada(
        ordenados,
        (item) => item.financeiro.desembolsado,
      ),
      totalEquipamentos: ordenados.reduce(
        (total, item) => total + item.equipamentos.length,
        0,
      ),
      totalConcluidos: ordenados.filter((item) => {
        const situacao = situacaoExibida(item);
        return (
          situacao !== null && SITUACOES_INSTRUMENTO_CONCLUIDO.has(situacao)
        );
      }).length,
      totalMonitorados: ordenados.filter((item) => monitorados.has(item.numero))
        .length,
      filtrados: ordenados,
    }),
    [monitorados, ordenados, pagina, pageSize, situacaoExibida],
  );
}
