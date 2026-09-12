import { useQuery } from '@tanstack/react-query';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { GEOJSON_MACRORREGIOES_URL } from '../data/constants';

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
    queryFn: async () => {
      const res = await fetch(GEOJSON_MACRORREGIOES_URL);
      if (!res.ok) throw new Error(`Falha ao carregar geometria das macrorregiões: HTTP ${res.status}`);
      return (await res.json()) as FeatureCollection<Geometry, GeoJsonProperties>;
    },
    staleTime: Infinity,
  });
}
