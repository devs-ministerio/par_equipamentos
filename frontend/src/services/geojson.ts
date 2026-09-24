import { z } from "zod";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from "geojson";
import { ApiError } from "@/lib/api-error";
import { GEOJSON_MACRORREGIOES_URL } from "@/data/constants";

const geometrySchema = z
  .object({ type: z.string(), coordinates: z.unknown() })
  .passthrough();
const featureSchema = z
  .object({
    type: z.literal("Feature"),
    geometry: geometrySchema.nullable(),
    properties: z.record(z.string(), z.unknown()).nullable(),
  })
  .passthrough();
const featureCollectionSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(featureSchema),
  })
  .passthrough();

async function buscarGeoJson(
  url: string,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ApiError("Não foi possível carregar a geometria do mapa.");
  }
  if (!response.ok)
    throw new ApiError(
      "Não foi possível carregar a geometria do mapa.",
      response.status,
    );
  const parsed = featureCollectionSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new ApiError("A geometria recebida não está no formato esperado.");
  return parsed.data as FeatureCollection<Geometry, GeoJsonProperties>;
}

export function buscarMacrorregioesGeoJson() {
  return buscarGeoJson(GEOJSON_MACRORREGIOES_URL);
}

export async function buscarContornoMunicipio(
  ibgeCode7: string,
): Promise<Feature<Geometry, GeoJsonProperties>> {
  const geoJson = await buscarGeoJson(
    `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${ibgeCode7}?formato=application/vnd.geo+json`,
  );
  const feature = geoJson.features[0];
  if (!feature) throw new ApiError("O contorno solicitado não foi encontrado.");
  return feature;
}
