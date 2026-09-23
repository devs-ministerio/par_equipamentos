import { useQuery } from '@tanstack/react-query';
import { buscarMacrorregioesGeoJson } from '@/services/geojson';

/**
 * Geometria das 121 macrorregiões de saúde (vendorizada em public/geo/, ver
 * comentário em MacroMap.tsx) -- não depende de família de equipamento, por
 * isso é buscada uma única vez e compartilhada (mesma chave de cache) entre
 * MapaPage e PainelGeralPage. `staleTime: Infinity` porque o arquivo estático
 * não muda durante a sessão (só troca com um novo deploy do front).
 */
export function useMacroGeojson() {
  return useQuery({
    queryKey: ['macro-geojson'],
    queryFn: buscarMacrorregioesGeoJson,
    staleTime: Infinity,
  });
}
