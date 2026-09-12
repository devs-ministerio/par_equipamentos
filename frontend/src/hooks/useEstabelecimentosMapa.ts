import { useQuery } from '@tanstack/react-query';
import { fetchEstabelecimentosPage } from '../services/api';
import type { PontoEstabelecimento } from '@/components/features/macro-map';
import type { NivelCoberturaRow } from '../types/domain';

// Maior macro nacional (Tomógrafo) tem 964 estabelecimentos distintos --
// folga confortável abaixo do teto de 2000 do endpoint (mesmo já usado pelo
// antigo fetch por UF).
const MAX_ESTABELECIMENTOS_POR_MACRO = 1500;

// Raio de BUSCA/EXIBIÇÃO de estabelecimentos ao redor do município
// selecionado no mapa -- volta a 75km (2026-08-24; chegou a ir a 200km,
// mas o usuário achou ruim de visualizar: com pontos espalhados até
// 200km, o fitBounds precisa enquadrar uma área bem maior, diluindo o
// foco visual no município selecionado). Mesmo valor do critério
// normativo do Tomógrafo, usado também como referência de "vizinhança"
// pras demais famílias.
export const RAIO_BUSCA_MUNICIPIO_KM = 75;

function toPonto(e: {
  cnes: string;
  latitude: number | null;
  longitude: number | null;
  qtd: number;
  qtdUso: number;
  susFlag: boolean;
  nome: string;
  uf: string;
  municipio: string;
}): PontoEstabelecimento | null {
  if (e.latitude == null || e.longitude == null) return null;
  return {
    cnes: e.cnes,
    lat: e.latitude,
    lon: e.longitude,
    qtd: e.qtd,
    qtdUso: e.qtdUso,
    susFlag: e.susFlag,
    nome: e.nome,
    uf: e.uf,
    municipio: e.municipio,
  };
}

/**
 * Pontos de estabelecimento (lat/long) pro recorte do "Mapa Rodoviário" --
 * so busca sob demanda (nunca os ~8 mil estabelecimentos nacionais de uma
 * vez). ~6% dos estabelecimentos nao tem geocodificacao no CNES (latitude/
 * longitude nulos) -- esses ficam de fora do mapa mas continuam contando
 * nos numeros/tabelas normalmente.
 *
 * Dois modos: sem municipio selecionado, busca por macro_code (visao geral
 * da macro). Com municipio selecionado, busca por RAIO GEOGRAFICO ao redor
 * da sede dele, ignorando fronteira de macro -- o equipamento mais proximo
 * desse municipio pode estar numa macro vizinha (o criterio normativo de
 * 75km e geografico puro, ver backend/app/pipeline/geo.py).
 */
export function useEstabelecimentosMapa(
  familia: string,
  selectedMacroId: string | null,
  municipioSelecionado: NivelCoberturaRow | undefined,
) {
  const modoMunicipio = municipioSelecionado?.latitude != null && municipioSelecionado.longitude != null;

  const query = useQuery({
    queryKey: modoMunicipio
      ? ['estabelecimentos-raio', familia, municipioSelecionado?.chave, RAIO_BUSCA_MUNICIPIO_KM]
      : ['estabelecimentos-macro', familia, selectedMacroId],
    queryFn: () =>
      modoMunicipio
        ? fetchEstabelecimentosPage({
            equipmentFamily: familia,
            near: {
              lat: municipioSelecionado!.latitude as number,
              lon: municipioSelecionado!.longitude as number,
              radiusKm: RAIO_BUSCA_MUNICIPIO_KM,
            },
            page: 1,
            pageSize: MAX_ESTABELECIMENTOS_POR_MACRO,
          })
        : fetchEstabelecimentosPage({
            equipmentFamily: familia,
            macroCodes: [selectedMacroId as string],
            page: 1,
            pageSize: MAX_ESTABELECIMENTOS_POR_MACRO,
          }),
    enabled: modoMunicipio || Boolean(selectedMacroId),
  });

  // Ordem preservada de proposito no modo municipio -- o backend devolve
  // esse modo ja ordenado por distancia (mais proximo primeiro, ver
  // app/routers/equipment_offer.py), entao pontos[0] e sempre o
  // estabelecimento mais proximo do municipio selecionado.
  const pontosMacro: PontoEstabelecimento[] = query.data ? query.data.items.map(toPonto).filter((p): p is PontoEstabelecimento => p !== null) : [];

  return {
    pontosMacro,
    // Total real dentro do raio de busca (pode ser bem maior que os pontos
    // efetivamente plotados) -- so faz sentido no modo municipio.
    totalEstabelecimentosNoRaio: modoMunicipio ? (query.data?.total ?? null) : null,
    isLoading: query.isLoading,
  };
}
