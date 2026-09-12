import { useQuery } from '@tanstack/react-query';
import { fetchEquipmentTotals } from '@/services/api';
import type { EquipmentTotals } from '@/services/api';

interface UseDashboardTotaisParams {
  equipmentFamily: string;
  states?: string[];
  macroCodes?: string[];
  healthRegionCodes?: string[];
  municipalities?: string[];
  cnesCodes?: string[];
}

/**
 * Total de Equipamentos / Total de Equipamentos em uso SUS -- vem direto de
 * equipment_offer_row (soma exata pro recorte pedido), nao de macro-coverage
 * (agregado so por macro), senao filtrar por Municipio/Regiao de
 * Saude/CNES mostraria o total da macro inteira em vez do recorte real (bug
 * corrigido em 2026-08-21). queryKey inclui toda dimensao de filtro que hoje
 * dispara o fetch de novo -- o Query cancela/ignora sozinho a resposta de um
 * filtro anterior que chegue atrasada (mesma guarda de corrida que existia
 * via variavel `cancelado`, agora nativa).
 */
export function useDashboardTotais(params: UseDashboardTotaisParams) {
  const statesKey = params.states?.join(',') ?? '';
  const macrosKey = params.macroCodes?.join(',') ?? '';
  const regioesSaudeKey = params.healthRegionCodes?.join(',') ?? '';
  const municipiosKey = params.municipalities?.join(',') ?? '';
  const cnesKey = params.cnesCodes?.join(',') ?? '';

  const query = useQuery({
    queryKey: [
      'equipment-totals',
      params.equipmentFamily,
      statesKey,
      macrosKey,
      regioesSaudeKey,
      municipiosKey,
      cnesKey,
    ],
    queryFn: (): Promise<EquipmentTotals> =>
      fetchEquipmentTotals({
        equipmentFamily: params.equipmentFamily,
        states: params.states,
        macroCodes: params.macroCodes,
        healthRegionCodes: params.healthRegionCodes,
        municipalities: params.municipalities,
        cnesCodes: params.cnesCodes,
      }),
  });

  // null em erro/carregando -- o Dashboard usa isso pra decidir entre o
  // valor exato e o fallback somado por macro (ver totalEquipMacro).
  return { totais: query.data ?? null };
}
