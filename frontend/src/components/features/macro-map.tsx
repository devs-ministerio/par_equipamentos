import { forwardRef, useEffect, useRef } from "react";
// Imports nomeados dos submodulos do D3 em vez de `import * as d3 from 'd3'`
// (2026-08-24) -- o metapacote 'd3' reexporta ~30 submodulos, a maioria
// nunca usada aqui (transicao, drag, zoom, force, etc.); isso sozinho
// tirou o D3 inteiro do chunk principal do build (ver App.tsx, rotas
// agora lazy) e reduz o que sobra so ao que este componente de fato chama.
import { select } from "d3-selection";
import type { GeoJsonProperties, Geometry } from "geojson";
import { resolveThemeColor } from "@/lib/theme-colors";
import type { CoberturaRow, Macrorregiao } from "@/types/domain";
import { construirProjecaoMacro } from "./macro-map-geometry";
import {
  construirTooltipNode,
  criarEscalaCor,
  desenharPontos,
  desenharRaioNormativo,
  desenharReguaEscala,
} from "./macro-map-draw";

type Feature = GeoJSON.Feature<Geometry, GeoJsonProperties>;
type FeatureCollection = GeoJSON.FeatureCollection<Geometry, GeoJsonProperties>;

export interface PontoEstabelecimento {
  cnes: string;
  lat: number;
  lon: number;
  qtd: number;
  qtdUso: number;
  susFlag: boolean;
  /** Nome do estabelecimento e UF -- so pro tooltip do mapa rodoviario
   * (MacroMapReal.tsx), 2026-08-24. */
  nome?: string | null;
  uf?: string | null;
  /** Municipio -- tambem so pro tooltip, mas alimenta ALEM disso o card
   * "Equipamento mais proximo" em MapaPage.tsx quando o ponto vem do modo
   * "raio no municipio" (busca por near_lat/near_lon, ja ordenada por
   * distancia pelo backend -- pontos[0] e sempre o mais proximo). */
  municipio?: string | null;
}

interface Props {
  geo: FeatureCollection;
  macros: Macrorregiao[];
  coberturaRows: CoberturaRow[];
  /** macro atualmente selecionada (drill-down aberto no painel ao lado) --
   * so pra destacar com borda mais grossa, nao afeta o dado desenhado. */
  selectedMacroId?: string | null;
  /** pontos de estabelecimento (lat/long) sobre o coropletico -- opcional,
   * so passado pelo MapaPage pra macro selecionada (nao faz sentido plotar
   * os ~8 mil estabelecimentos nacionais de uma vez, viraria ruido visual).
   * So decorativo (pointer-events: none): o hover/clique continua sendo o
   * poligono da macro por baixo. */
  pontos?: PontoEstabelecimento[];
  /** Raio normativo (km) desenhado em volta de cada ponto SUS -- so faz
   * sentido pro TOMOGRAFO (Caderno 1: "100 mil hab. OU raio de 75 km"),
   * MapaPage so passa isso quando FAMILIA === 'TOMOGRAFO'. Puramente
   * visual/informativo: NAO muda a cor da macro nem a classificacao
   * Hipo/Hiper (ver comentario em MunicipioDetalheModal.tsx sobre por que
   * isso ainda nao entra na classificacao oficial). */
  raioKm?: number;
  /** Quando presente, a projecao ajusta so pra essa macro (com margem) em
   * vez do Brasil inteiro -- mapa "real" recortado (2026-08-23), pros
   * pontos de estabelecimento e o raio de 75km ficarem legiveis (na escala
   * nacional eles viravam um aglomerado minusculo). Ainda desenha TODAS as
   * macros (geo.features) por baixo, so pra dar contexto geografico (onde
   * no pais essa macro fica) -- so a projecao muda, nao os dados. */
  zoomMacroId?: string | null;
  /** Produtividade da familia atual (habitantes SUS-dependentes por
   * equipamento) -- usada no tooltip pra mostrar o coeficiente ("1,31x",
   * MESMO indicador colorido usado em todo o resto do app) em vez de
   * "pessoas por equipamento" (2026-08-24). Default 100_000 (TOMOGRAFO) so
   * por seguranca de assinatura -- os dois call sites hoje (MapaPage,
   * PainelGeralPage) sempre passam o valor certo da familia selecionada
   * (getEquipamento(familia).produtividade). */
  produtividade?: number;
  onSelectMacro: (macroId: string) => void;
}

/**
 * Coropletico por MACRORREGIAO DE SAUDE (decisao 2026-08-22) -- substitui o
 * antigo BrazilMap.tsx, que coloria por UF com a cobertura das macros
 * daquele estado MEDIADA (calcularCoberturaPorUf), perdendo precisao. Aqui
 * cada uma das 121 macros e um poligono proprio, colorido com o dado exato
 * dela (mesmo GET /macro-coverage que a tabela do Dashboard usa) -- sem
 * agregacao nenhuma no meio.
 *
 * Geometria vem de public/geo/macrorregioes.geojson (vendorizada localmente,
 * gerada a partir de docs/macroregiao.geojson com mapshaper -simplify 15%,
 * ver GEOJSON_MACRORREGIOES_URL em data/constants.ts) -- resolve o TODO
 * antigo de depender de CDN de terceiro sem fallback, e cai de 3,3 MB pra
 * ~240 KB no processo.
 *
 * Cor via `resolveThemeColor` (src/lib/theme-colors.ts) -- D3 desenha
 * imperativamente (`.attr()`), nao aceita `className`, mas a cor ainda vem
 * só de index.css (nunca hex cru), lida em runtime a cada render do efeito.
 */
export const MacroMap = forwardRef<HTMLDivElement, Props>(function MacroMap(
  {
    geo,
    macros,
    coberturaRows,
    selectedMacroId,
    pontos,
    raioKm,
    zoomMacroId,
    produtividade = 100_000,
    onSelectMacro,
  },
  encaminharRef,
) {
  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el || !geo) return;
    el.innerHTML = "";
    el.style.position = "relative";

    const macroById = new Map(macros.map((m) => [m.id, m]));
    const coberturaById = new Map(coberturaRows.map((r) => [r.macroId, r]));

    // Lido 1x por render do efeito (nao por elemento/tick do D3) -- chamar
    // getComputedStyle em cada elemento de uma selecao .data().enter() faria
    // layout thrashing sem necessidade, o valor da variavel e o mesmo pra
    // todos os elementos desenhados nesta passada.
    const primary = resolveThemeColor("--primary");
    const foreground = resolveThemeColor("--foreground");
    const background = resolveThemeColor("--background");
    const card = resolveThemeColor("--card");
    const muted = resolveThemeColor("--muted");
    const mutedForeground = resolveThemeColor("--muted-foreground");
    const destructive = resolveThemeColor("--destructive");
    const destructiveBg = resolveThemeColor("--destructive-bg");
    const success = resolveThemeColor("--success");
    const successBg = resolveThemeColor("--success-bg");

    // Escala de cor em DUAS gradações, cortada exatamente no mesmo corte da
    // classificação oficial (coeficiente 1x = cobertura 100%) -- ver
    // docstring de `criarEscalaCor` (macro-map-draw.ts). O status textual
    // vem do backend para preservar "Dados indisponíveis" sem converter em
    // Hipo/Hiper.
    const escalaCor = criarEscalaCor(
      destructive,
      destructiveBg,
      success,
      successBg,
    );

    const width = el.clientWidth || 700;
    const height = 560;

    const svg = select(el)
      .append("svg")
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    const { proj, path, featureAlvo, featuresParaDesenhar } =
      construirProjecaoMacro(geo, zoomMacroId, width, height);

    const tooltip = document.createElement("div");
    tooltip.style.cssText =
      `position:absolute;background:${foreground};color:${background};padding:8px 12px;border-radius:8px;` +
      "font-size:12px;pointer-events:none;display:none;z-index:99;line-height:1.5;" +
      "box-shadow:0 4px 12px rgba(0,0,0,0.2);";
    el.appendChild(tooltip);

    svg
      .selectAll("path")
      .data(featuresParaDesenhar)
      .enter()
      .append("path")
      .attr("d", path as unknown as (f: Feature) => string)
      .attr("stroke", card)
      .attr("stroke-width", (d) =>
        (d as Feature).properties?.cod_macro === selectedMacroId ? 2 : 0.6,
      )
      .attr("cursor", "pointer")
      .attr("fill", (d) => {
        const macroId = (d as Feature).properties?.cod_macro as
          | string
          | undefined;
        const row = macroId ? coberturaById.get(macroId) : undefined;
        return row?.status === "Dados indisponíveis"
          ? muted
          : row
            ? escalaCor(row.cobertura)
            : muted;
      })
      .on("mousemove", (event: MouseEvent, d) => {
        const macroId = (d as Feature).properties?.cod_macro as
          | string
          | undefined;
        const macro = macroId ? macroById.get(macroId) : undefined;
        const row = macroId ? coberturaById.get(macroId) : undefined;
        const rect = el.getBoundingClientRect();
        tooltip.style.display = "block";
        tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        tooltip.style.top = `${event.clientY - rect.top - 40}px`;
        tooltip.replaceChildren(
          construirTooltipNode(macroId, macro, row, produtividade, background),
        );
      })
      .on("mouseleave", () => {
        tooltip.style.display = "none";
      })
      .on("click", (_event: MouseEvent, d) => {
        const macroId = (d as Feature).properties?.cod_macro as
          | string
          | undefined;
        if (macroId) onSelectMacro(macroId);
      });

    desenharRaioNormativo(svg, path, pontos, raioKm, primary);
    desenharPontos(svg, proj, pontos, foreground, mutedForeground, card);
    desenharReguaEscala(svg, featureAlvo, proj, height, card, foreground);
  }, [
    geo,
    macros,
    coberturaRows,
    selectedMacroId,
    pontos,
    raioKm,
    zoomMacroId,
    produtividade,
    onSelectMacro,
  ]);

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        if (typeof encaminharRef === "function") encaminharRef(node);
        else if (encaminharRef) encaminharRef.current = node;
      }}
      style={{ width: "100%", minHeight: 560 }}
    />
  );
});
