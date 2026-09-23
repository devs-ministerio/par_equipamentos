import { useMemo } from 'react';
import type { ConvenioUnificado } from '@/types/monitoramento';
import { SITUACOES_INSTRUMENTO_CONCLUIDO } from '@/lib/equipamento-catalogo';

export function useDadosOficiaisResumo({ itens, monitorados, situacaoExibida, pagina, pageSize }: { itens: ConvenioUnificado[]; monitorados: Set<string>; situacaoExibida: (item: ConvenioUnificado) => string | null; pagina: number; pageSize: number }) {
  const ordenados = useMemo(() => [...itens].sort((a, b) => Number(monitorados.has(b.numero)) - Number(monitorados.has(a.numero))), [itens, monitorados]);
  return useMemo(() => ({
    paginados: ordenados.slice((pagina - 1) * pageSize, pagina * pageSize),
    totalGlobal: ordenados.reduce((total, item) => total + (item.financeiro.global || 0), 0),
    totalDesembolsado: ordenados.reduce((total, item) => total + (item.financeiro.desembolsado || 0), 0),
    totalEquipamentos: ordenados.reduce((total, item) => total + item.equipamentos.length, 0),
    totalConcluidos: ordenados.filter((item) => {
      const situacao = situacaoExibida(item);
      return situacao !== null && SITUACOES_INSTRUMENTO_CONCLUIDO.has(situacao);
    }).length,
    totalMonitorados: ordenados.filter((item) => monitorados.has(item.numero)).length,
    filtrados: ordenados,
  }), [monitorados, ordenados, pagina, pageSize, situacaoExibida]);
}
