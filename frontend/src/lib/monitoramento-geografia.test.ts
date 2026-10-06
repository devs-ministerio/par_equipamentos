import { describe, expect, it } from "vitest";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import {
  agruparInstrumentosPorLocal,
  distribuirInstrumentosPorMacrorregiao,
  rotuloMacrorregiao,
} from "./monitoramento-geografia";

const geo: FeatureCollection<Geometry, GeoJsonProperties> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { cod_macro: "1001" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-51, -16],
            [-51, -14],
            [-49, -14],
            [-49, -16],
            [-51, -16],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { cod_macro: "1002" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-49, -16],
            [-49, -14],
            [-47, -14],
            [-47, -16],
            [-49, -16],
          ],
        ],
      },
    },
  ],
};

function instrumento(
  id: number,
  latitude: number | null,
  longitude: number | null,
) {
  return { id, latitude, longitude } as InstrumentoEquipamento;
}

describe("distribuirInstrumentosPorMacrorregiao", () => {
  it("exibe o nome oficial da macro e substitui o código 5302 durante a carga", () => {
    expect(rotuloMacrorregiao("5302", new Map())).toBe("Distrito Federal");
    expect(
      rotuloMacrorregiao("5302", new Map([["5302", "DISTRITO FEDERAL"]])),
    ).toBe("DISTRITO FEDERAL");
  });
  it("associa cada CNES à macro pelo ponto e contabiliza coordenadas ausentes", () => {
    const entrada = [
      instrumento(1, -15, -50),
      instrumento(2, -15, -48),
      instrumento(3, -15.4, -50.1),
      instrumento(4, null, null),
    ];

    const resultado = distribuirInstrumentosPorMacrorregiao(entrada, geo);

    expect(resultado.contagemPorMacro.get("1001")).toBe(2);
    expect(resultado.contagemPorMacro.get("1002")).toBe(1);
    expect(resultado.pontos.map((ponto) => ponto.macroId)).toEqual([
      "1001",
      "1002",
      "1001",
    ]);
    expect(resultado.semCoordenadas).toBe(1);
    expect(resultado.foraDasMacros).toBe(0);
  });

  it("identifica pontos fora da geometria para informar a exclusão do mapa", () => {
    const resultado = distribuirInstrumentosPorMacrorregiao(
      [instrumento(1, -18, -55), instrumento(2, 99, -50)],
      geo,
    );

    expect(resultado.pontos).toHaveLength(1);
    expect(resultado.pontos[0].macroId).toBeNull();
    expect(resultado.foraDasMacros).toBe(1);
    expect(resultado.semCoordenadas).toBe(1);
    expect(resultado.contagemPorMacro.size).toBe(0);
  });

  it("agrupa instrumentos na mesma coordenada sem duplicar marcadores", () => {
    const distribuicao = distribuirInstrumentosPorMacrorregiao(
      [
        instrumento(1, -15, -50),
        instrumento(2, -15, -50),
        instrumento(3, -15, -48),
      ],
      geo,
    );
    const locais = agruparInstrumentosPorLocal(distribuicao.pontos);

    expect(locais).toHaveLength(2);
    expect(locais[0].instrumentos.map((ponto) => ponto.instrumento.id)).toEqual(
      [1, 2],
    );
    expect(locais[1].instrumentos.map((ponto) => ponto.instrumento.id)).toEqual(
      [3],
    );
  });
});
