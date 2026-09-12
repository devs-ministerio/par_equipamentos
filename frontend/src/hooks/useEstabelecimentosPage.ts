import { useQuery } from '@tanstack/react-query';
import { fetchEstabelecimentosPage } from '@/services/api';
import type { EstabelecimentosResult } from '@/services/api';

interface UseEstabelecimentosPageParams {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  cnesCodes?: string[];
  search?: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

/**
 * Página de Estabelecimentos de Saúde -- filtro, busca e ordenação
 * acontecem no backend. queryKey inclui toda dimensão que hoje dispara o
 * fetch de novo (filtro geográfico, busca, ordenação, página). Antes disso
 * a guarda contra corrida era manual (`cancelado`): selecionar um CNES
 * cascateia pro Município num segundo instante (efeito separado em
 * useFiltrosMacro), então um pedido SEM filtro de município dispara
 * primeiro (mais lento, lista nacional) e um pedido JÁ filtrado dispara
 * logo depois (mais rápido) -- sem essa guarda, a resposta lenta e
 * desfiltrada chegava por último e sobrescrevia a tabela com a lista
 * nacional errada. Com queryKey distinta por filtro, isso não acontece mais.
 */
export function useEstabelecimentosPage(params: UseEstabelecimentosPageParams) {
  const statesKey = params.states?.join(',') ?? '';
  const macrosKey = params.macroCodes?.join(',') ?? '';
  const regioesSaudeKey = params.healthRegionCodes?.join(',') ?? '';
  const municipiosKey = params.municipalities?.join(',') ?? '';
  const cnesKey = params.cnesCodes?.join(',') ?? '';

  const query = useQuery({
    queryKey: [
      'estabelecimentos-page',
      params.equipmentFamily,
      statesKey,
      macrosKey,
      regioesSaudeKey,
      municipiosKey,
      cnesKey,
      params.search ?? '',
      params.sortBy,
      params.sortDir,
      params.page,
      params.pageSize,
    ],
    queryFn: (): Promise<EstabelecimentosResult> =>
      fetchEstabelecimentosPage({
        equipmentFamily: params.equipmentFamily,
        states: params.states,
        macroCodes: params.macroCodes,
        healthRegionCodes: params.healthRegionCodes,
        municipalities: params.municipalities,
        cnesCodes: params.cnesCodes,
        search: params.search,
        sortBy: params.sortBy,
        sortDir: params.sortDir,
        page: params.page,
        pageSize: params.pageSize,
      }),
  });

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    error: query.error as Error | null,
  };
}
