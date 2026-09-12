import { geoMercator, geoPath } from 'd3-geo';
import type { GeoJsonProperties, Geometry } from 'geojson';

type Feature = GeoJSON.Feature<Geometry, GeoJsonProperties>;
type FeatureCollection = GeoJSON.FeatureCollection<Geometry, GeoJsonProperties>;

/**
 * Projeção Mercator + `geoPath` do mapa nacional (ou recortado numa macro,
 * quando `zoomMacroId` está presente) -- extraído do efeito de desenho de
 * `MacroMap.tsx` (não é um hook React: a largura vem de `el.clientWidth`,
 * medido dentro do próprio efeito, então não há estado reativo aqui pra
 * justificar `useMemo`/`useState` -- só isolamos a conta de geometria do
 * resto do desenho D3, sem mudar quando ela roda).
 */
export function construirProjecaoMacro(geo: FeatureCollection, zoomMacroId: string | null | undefined, width: number, height: number) {
  const featureAlvo = zoomMacroId
    ? geo.features.find((f) => (f as Feature).properties?.cod_macro === zoomMacroId)
    : undefined;

  const proj = geoMercator();
  if (featureAlvo) {
    // margem de ~8% em volta -- senao a macro encosta na borda do SVG
    // (fitSize/fitExtent ajusta exatamente, sem folga nenhuma por padrao).
    const m = { x: width * 0.08, y: height * 0.08 };
    proj.fitExtent([[m.x, m.y], [width - m.x, height - m.y]], featureAlvo);
  } else {
    proj.fitSize([width, height], geo);
  }
  const path = geoPath().projection(proj);

  // Recortado (zoomMacroId) desenha SO a macro selecionada, sem as
  // vizinhas -- pedido explicito 2026-08-23 (antes desenhava geo.features
  // inteiro por baixo, so pra contexto geografico; ficou preferivel focar
  // so na area que importa, sem distrair com macro vizinha "cortada" na
  // borda do recorte).
  const featuresParaDesenhar = featureAlvo ? [featureAlvo] : geo.features;

  return { proj, path, featureAlvo, featuresParaDesenhar };
}

/** km -> graus de arco (o que geoCircle espera) -- 1 grau de grande
 * circulo na Terra equivale a raio_terra_km * (pi/180) km. */
export const KM_POR_GRAU = (Math.PI / 180) * 6371;
