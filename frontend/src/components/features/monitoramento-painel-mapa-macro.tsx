import { useEffect, useState } from "react";
import { scaleLinear } from "d3-scale";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { construirProjecaoMacro } from "@/components/features/macro-map-geometry";
import {
  rotuloMacrorregiao,
  type LocalInstrumentos,
} from "@/lib/monitoramento-geografia";
import { resolveThemeColor } from "@/lib/theme-colors";

type GeoMacrorregioes = FeatureCollection<Geometry, GeoJsonProperties>;

export function MonitoramentoPainelMapaMacro({
  geo,
  nomesPorMacro,
  contagemPorMacro,
  locais,
  macroSelecionada,
  localSelecionado,
  onSelecionarMacro,
  onSelecionarLocal,
}: {
  geo: GeoMacrorregioes;
  nomesPorMacro: Map<string, string>;
  contagemPorMacro: Map<string, number>;
  locais: LocalInstrumentos[];
  macroSelecionada: string | null;
  localSelecionado: string | null;
  onSelecionarMacro: (macroId: string | null) => void;
  onSelecionarLocal: (chave: string | null) => void;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState(700);
  const [macroEmFoco, setMacroEmFoco] = useState<string | null>(null);

  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setLargura(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const altura = largura < 520 ? 410 : 500;
  // Mesma geometria, projeção Mercator e recorte usados no mapa de cobertura.
  const { proj, path, featuresParaDesenhar } = construirProjecaoMacro(
    geo,
    null,
    largura,
    altura,
  );
  const corInicial = resolveThemeColor("--secondary");
  const corFinal = resolveThemeColor("--primary");
  const corVazia = resolveThemeColor("--muted");
  const corContorno = resolveThemeColor("--card");
  const maiorContagem = Math.max(1, ...contagemPorMacro.values());
  const escala = scaleLinear<string>()
    .domain([0, maiorContagem])
    .range([corInicial, corFinal])
    .clamp(true);
  const locaisVisiveis = locais;
  const macroDestacada = macroEmFoco ?? macroSelecionada;

  return (
    <div>
      <div ref={setContainer} className="w-full bg-muted/25">
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          role="group"
          aria-label={`Mapa de ${geo.features.length} macrorregiões de saúde e ${locaisVisiveis.length} estabelecimentos`}
          className="block h-auto w-full"
        >
          {featuresParaDesenhar.map((feature) => {
            const macroId = feature.properties?.cod_macro;
            if (typeof macroId !== "string") return null;
            const quantidade = contagemPorMacro.get(macroId) ?? 0;
            const selecionada = macroSelecionada === macroId;
            return (
              <path
                key={macroId}
                d={path(feature) ?? ""}
                fill={quantidade > 0 ? escala(quantidade) : corVazia}
                stroke={selecionada ? corFinal : corContorno}
                strokeWidth={selecionada ? 2 : 0.7}
                role="button"
                tabIndex={0}
                aria-label={`${rotuloMacrorregiao(macroId, nomesPorMacro)}, ${quantidade} ${quantidade === 1 ? "instrumento" : "instrumentos"}`}
                aria-pressed={selecionada}
                className="cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary"
                onMouseEnter={() => setMacroEmFoco(macroId)}
                onMouseLeave={() => setMacroEmFoco(null)}
                onFocus={() => setMacroEmFoco(macroId)}
                onBlur={() => setMacroEmFoco(null)}
                onClick={() => onSelecionarMacro(selecionada ? null : macroId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelecionarMacro(selecionada ? null : macroId);
                  }
                }}
              />
            );
          })}
          {locaisVisiveis.map((local) => {
            const posicao = proj([local.longitude, local.latitude]);
            if (!posicao) return null;
            const selecionado = localSelecionado === local.chave;
            const quantidade = local.instrumentos.length;
            return (
              <g
                key={local.chave}
                role="button"
                tabIndex={0}
                aria-label={`${quantidade} ${quantidade === 1 ? "instrumento" : "instrumentos"} nesta localização`}
                aria-pressed={selecionado}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() =>
                  onSelecionarLocal(selecionado ? null : local.chave)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelecionarLocal(selecionado ? null : local.chave);
                  }
                }}
              >
                <circle
                  cx={posicao[0]}
                  cy={posicao[1]}
                  r={selecionado ? 9 : quantidade > 1 ? 7 : 5}
                  fill="var(--foreground)"
                  stroke="var(--card)"
                  strokeWidth={selecionado ? 3 : 1.8}
                />
                {quantidade > 1 && (
                  <text
                    x={posicao[0]}
                    y={posicao[1] + 2.5}
                    textAnchor="middle"
                    fill="var(--card)"
                    fontSize="8"
                    fontWeight="700"
                    aria-hidden="true"
                  >
                    {quantidade > 9 ? "9+" : quantidade}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>
          {macroDestacada
            ? `${rotuloMacrorregiao(macroDestacada, nomesPorMacro)} · ${contagemPorMacro.get(macroDestacada) ?? 0} instrumentos`
            : "Selecione uma macrorregião para abrir o mapa rodoviário"}
        </span>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <i
              aria-hidden="true"
              className="size-2.5 rounded-full bg-foreground"
            />
            Estabelecimento
          </span>
          <span>Tom mais escuro: mais instrumentos</span>
        </div>
      </div>
    </div>
  );
}
