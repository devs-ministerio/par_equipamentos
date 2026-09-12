import { useQuery } from '@tanstack/react-query';
import { fetchEstabelecimentosPage } from '../services/api';
import type { PontoEstabelecimento } from '@/components/features/macro-map';
import { RAIO_BUSCA_MUNICIPIO_KM } from './useEstabelecimentosMapa';
import { distanciaKm } from '../utils/geo';
import type { NivelCoberturaRow } from '../types/domain';

// Maior distancia possivel entre 2 pontos dentro do Brasil e ~4300km
// (extremo norte a extremo sul) -- 4500km cobre com folga, uma unica
// tentativa em vez de varias incrementais.
const RAIO_CONTINENTAL_KM = 4500;

// "Municipio - UF" -- municipio sozinho e ambiguo (varios nomes se repetem
// entre estados, mesmo motivo da chave composta usada nos outros filtros
// da tela).
function formatarMunicipioUf(municipio?: string | null, uf?: string | null): string | null {
  if (!municipio) return null;
  return uf ? `${municipio} - ${uf}` : municipio;
}

/**
 * Nome do municipio onde fica o equipamento mais proximo, e a distancia ate
 * ele -- so calculado quando um municipio esta selecionado E ele proprio
 * nao tem equipamento SUS (oferta, nao ofertaTotal -- um municipio com SO
 * equipamento privado nao tem acesso via SUS nenhum, entao o "mais proximo"
 * continua relevante pra ele). Se ja tem SUS proprio, nao ha "mais proximo"
 * relevante pra apontar (regra confirmada 2026-08-24).
 *
 * So TOMOGRAFO tem o campo pre-calculado no pipeline
 * (distance_km_nearest_equipment, sem limite de raio -- ver
 * backend/app/pipeline/geo.py); pras demais familias calcula ao vivo no
 * cliente com Haversine (utils/geo.ts), reaproveitando o mesmo pontosMacro
 * ja buscado pro mapa quando possivel:
 *   1. TOMOGRAFO com distancia dentro do raio visual -> pontosMacro[0]-like
 *      (ja veio do hook de estabelecimentos, sem busca extra).
 *   2. TOMOGRAFO com distancia FORA do raio visual -> busca a parte, raio
 *      dimensionado exatamente pra essa distancia ja conhecida.
 *   3. Outras familias, ja tem algo dentro do raio visual -> usa direto.
 *   4. Outras familias, nada no raio visual -> UMA tentativa com raio
 *      continental pra achar o mais proximo onde quer que esteja.
 */
export function useEquipamentoMaisProximo(
  familia: string,
  municipioSelecionado: NivelCoberturaRow | undefined,
  pontosMacro: PontoEstabelecimento[],
) {
  const centro =
    municipioSelecionado &&
    municipioSelecionado.oferta === 0 &&
    municipioSelecionado.latitude != null &&
    municipioSelecionado.longitude != null
      ? { lat: municipioSelecionado.latitude, lon: municipioSelecionado.longitude }
      : null;

  // pontosMacro NAO e filtrado por SUS (mostra os dois tipos no mapa, de
  // proposito). Pra achar o mais proximo que ATENDE SUS e EM USO
  // (2026-08-24, a pedido), procura o primeiro com susFlag na lista ja
  // ordenada por distancia.
  const maisProximoSusNoRaioVisual = pontosMacro.find((p) => p.susFlag && p.qtdUso > 0);

  const distanciaPipeline =
    familia === 'TOMOGRAFO' ? (municipioSelecionado?.distanciaKmEquipamentoMaisProximo ?? null) : null;

  const usaRaioVisual =
    centro != null &&
    (familia === 'TOMOGRAFO'
      ? distanciaPipeline != null && distanciaPipeline <= RAIO_BUSCA_MUNICIPIO_KM && Boolean(maisProximoSusNoRaioVisual)
      : Boolean(maisProximoSusNoRaioVisual));

  const habilitarFallback =
    centro != null && !usaRaioVisual && (familia !== 'TOMOGRAFO' || distanciaPipeline != null);

  const radiusKm = familia === 'TOMOGRAFO' ? (distanciaPipeline as number) + 2 : RAIO_CONTINENTAL_KM;

  const fallbackQuery = useQuery({
    queryKey: ['equipamento-mais-proximo', familia, municipioSelecionado?.chave, radiusKm],
    queryFn: () =>
      fetchEstabelecimentosPage({
        equipmentFamily: familia,
        near: { ...(centro as { lat: number; lon: number }), radiusKm },
        susOnly: true,
        inUseSusOnly: true,
        page: 1,
        pageSize: 1,
      }),
    enabled: habilitarFallback,
  });

  if (!centro) return { nome: null, distanciaKm: null };

  const pontoUsado = usaRaioVisual ? maisProximoSusNoRaioVisual : fallbackQuery.data?.items[0];
  if (pontoUsado) {
    const lat = 'lat' in pontoUsado ? pontoUsado.lat : pontoUsado.latitude;
    const lon = 'lon' in pontoUsado ? pontoUsado.lon : pontoUsado.longitude;
    if (lat != null && lon != null) {
      return {
        nome: formatarMunicipioUf(pontoUsado.municipio, pontoUsado.uf),
        distanciaKm: distanciaKm(centro.lat, centro.lon, lat, lon),
      };
    }
  }

  // Enquanto a busca de fallback ainda nao resolveu (ou falhou), TOMOGRAFO
  // mostra a distancia ja conhecida do pipeline -- as demais familias nao
  // tem nenhum valor pra mostrar ate a busca completar.
  if (familia === 'TOMOGRAFO' && distanciaPipeline != null) {
    return { nome: null, distanciaKm: distanciaPipeline };
  }
  return { nome: null, distanciaKm: null };
}
