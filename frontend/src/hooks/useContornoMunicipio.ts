import { useQuery } from '@tanstack/react-query';
import { buscarContornoMunicipio } from '@/services/geojson';

/**
 * Contorno REAL (poligono oficial) do municipio selecionado -- buscado sob
 * demanda na API de malhas do IBGE (2026-08-24, a pedido: "nao quero
 * circulo, quero de fato o contorno do municipio"). CORS liberado
 * (Access-Control-Allow-Origin: *, testado 2026-08-24) e sem chave/conta,
 * dado geografico OFICIAL do governo. Payload pequeno (~10-25KB por
 * municipio) porque busca SO O municipio selecionado, nunca a malha
 * nacional inteira -- nada vendorizado localmente (diferente do geojson de
 * macro, reusado em toda visita).
 *
 * `staleTime: Infinity` -- fronteira de municipio nao muda durante a
 * sessao, o cache do proprio TanStack Query (por `ibgeCode7`) substitui o
 * `Map` em `useRef` que existia antes pra esse mesmo fim.
 */
export function useContornoMunicipio(ibgeCode7: string | null | undefined) {
  const query = useQuery({
    queryKey: ['municipio-contorno', ibgeCode7],
    queryFn: () => buscarContornoMunicipio(ibgeCode7!),
    enabled: Boolean(ibgeCode7),
    staleTime: Infinity,
    // silencia e segue -- mapa fica so sem o contorno extra (pin do
    // municipio e o resto da tela continuam funcionando normalmente), por
    // isso so 1 tentativa em vez do retry default.
    retry: 1,
  });

  return { contorno: query.isSuccess ? query.data : null, erro: query.isError ? query.error : null };
}
