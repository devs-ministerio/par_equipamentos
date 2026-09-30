import { geoContains } from "d3-geo";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

type GeoMacrorregioes = FeatureCollection<Geometry, GeoJsonProperties>;

/** Nomes vêm da dimensão já exibida no Mapa de Cobertura; o fallback 5302
 * evita voltar a exibir só o código enquanto a consulta de nomes carrega. */
export function rotuloMacrorregiao(
  id: string,
  nomes: Map<string, string>,
): string {
  return (
    nomes.get(id) ?? (id === "5302" ? "Distrito Federal" : `Macrorregião ${id}`)
  );
}

export interface InstrumentoLocalizado {
  instrumento: InstrumentoEquipamento;
  latitude: number;
  longitude: number;
  macroId: string | null;
}

export interface LocalInstrumentos {
  chave: string;
  latitude: number;
  longitude: number;
  macroId: string;
  instrumentos: InstrumentoLocalizado[];
}

/** Um marcador por coordenada evita esconder instrumentos sobrepostos. */
export function agruparInstrumentosPorLocal(
  pontos: InstrumentoLocalizado[],
): LocalInstrumentos[] {
  const locais = new Map<string, LocalInstrumentos>();
  for (const ponto of pontos) {
    if (!ponto.macroId) continue;
    const chave = `${ponto.macroId}:${ponto.latitude.toFixed(6)},${ponto.longitude.toFixed(6)}`;
    const local = locais.get(chave) ?? {
      chave,
      latitude: ponto.latitude,
      longitude: ponto.longitude,
      macroId: ponto.macroId,
      instrumentos: [],
    };
    local.instrumentos.push(ponto);
    locais.set(chave, local);
  }
  return [...locais.values()];
}

export function distribuirInstrumentosPorMacrorregiao(
  instrumentos: InstrumentoEquipamento[],
  geo: GeoMacrorregioes,
) {
  const features = geo.features.filter(
    (feature) => typeof feature.properties?.cod_macro === "string",
  );
  const contagemPorMacro = new Map<string, number>();
  const pontos: InstrumentoLocalizado[] = [];
  let semCoordenadas = 0;
  let foraDasMacros = 0;

  for (const instrumento of instrumentos) {
    const latitude = instrumento.latitude;
    const longitude = instrumento.longitude;
    if (
      latitude == null ||
      longitude == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      semCoordenadas += 1;
      continue;
    }

    // O município do instrumento é texto livre; a macro é resolvida pelo
    // ponto oficial do CNES dentro da geometria já usada em /mapa.
    const macro = features.find((feature) =>
      geoContains(feature, [longitude, latitude]),
    );
    const codigo = macro?.properties?.cod_macro;
    const macroId = typeof codigo === "string" ? codigo : null;
    if (!macroId) foraDasMacros += 1;
    else
      contagemPorMacro.set(macroId, (contagemPorMacro.get(macroId) ?? 0) + 1);

    pontos.push({
      instrumento,
      latitude,
      longitude,
      macroId,
    });
  }

  return { pontos, contagemPorMacro, semCoordenadas, foraDasMacros };
}
