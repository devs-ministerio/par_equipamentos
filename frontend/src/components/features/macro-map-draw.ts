import { max as d3Max } from 'd3-array';
import { geoCentroid, geoCircle } from 'd3-geo';
import { scaleLinear, scaleSqrt } from 'd3-scale';
import type { GeoPath, GeoProjection } from 'd3-geo';
import type { Selection } from 'd3-selection';
import type { GeoJsonProperties, Geometry } from 'geojson';
import { statusMeta } from '@/utils/status';
import { resolveThemeColor } from '@/lib/theme-colors';
import { formatMultiplicador } from '@/utils/format';
import { calcularCoeficiente } from '@/utils/coeficiente';
import type { CoberturaRow, Macrorregiao } from '@/types/domain';
import type { PontoEstabelecimento } from './macro-map';
import { KM_POR_GRAU } from './macro-map-geometry';

type Feature = GeoJSON.Feature<Geometry, GeoJsonProperties>;
type Svg = Selection<SVGSVGElement, unknown, null, undefined>;

/**
 * Escala de cor da macro em DUAS gradações, cortada exatamente no mesmo
 * corte da classificação oficial (coeficiente 1x = cobertura 100%): abaixo
 * de 100% vermelho (mais escuro/saturado = mais longe da meta), 100%+ verde
 * (mais escuro/saturado = mais acima da meta) -- extraído do efeito de
 * desenho de `MacroMap.tsx`, ver docstring histórica lá.
 */
export function criarEscalaCor(destructive: string, destructiveBg: string, success: string, successBg: string) {
  const escalaVermelho = scaleLinear<string>().domain([0, 100]).range([destructive, destructiveBg]).clamp(true);
  const escalaVerde = scaleLinear<string>().domain([100, 200]).range([successBg, success]).clamp(true);
  return function escalaCor(cobertura: number): string {
    return cobertura < 100 ? escalaVermelho(cobertura) : escalaVerde(cobertura);
  };
}

/**
 * Raio normativo (75km do Tomógrafo) -- um círculo geodésico de verdade por
 * ponto SUS (`geoCircle`, não um raio fixo em pixel: um raio fixo em pixel
 * ignoraria a distorção da projeção Mercator). Só os pontos SUS (`susFlag`)
 * têm raio -- o critério é sobre equipamento SUS, mesmo denominador de D-02.
 */
export function desenharRaioNormativo(
  svg: Svg,
  path: GeoPath,
  pontos: PontoEstabelecimento[] | undefined,
  raioKm: number | undefined,
  primary: string,
) {
  if (!pontos || pontos.length === 0 || !raioKm) return;
  const raioGraus = raioKm / KM_POR_GRAU;
  const circulos = pontos.filter((p) => p.susFlag).map((p) => geoCircle().center([p.lon, p.lat]).radius(raioGraus)());
  svg
    .append('g')
    .selectAll('path')
    .data(circulos)
    .enter()
    .append('path')
    .attr('d', path as unknown as (f: GeoJSON.Geometry) => string)
    .attr('fill', primary)
    .attr('fill-opacity', 0.06)
    .attr('stroke', primary)
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width', 1)
    .attr('pointer-events', 'none');
}

/** Pontos de estabelecimento (tamanho = qtd. de equipamentos) sobre o
 * coroplético -- decorativo (`pointer-events: none`), o hover/clique
 * continua sendo o polígono da macro por baixo. */
export function desenharPontos(
  svg: Svg,
  proj: GeoProjection,
  pontos: PontoEstabelecimento[] | undefined,
  foreground: string,
  mutedForeground: string,
  card: string,
) {
  if (!pontos || pontos.length === 0) return;
  const maiorQtd = d3Max(pontos, (p) => p.qtd) ?? 1;
  const raio = scaleSqrt().domain([1, maiorQtd]).range([2.5, 9]).clamp(true);
  svg
    .append('g')
    .selectAll('circle')
    .data(pontos)
    .enter()
    .append('circle')
    .attr('cx', (p) => proj([p.lon, p.lat])?.[0] ?? -1000)
    .attr('cy', (p) => proj([p.lon, p.lat])?.[1] ?? -1000)
    .attr('r', (p) => raio(p.qtd))
    .attr('fill', (p) => (p.susFlag ? foreground : mutedForeground))
    .attr('fill-opacity', 0.85)
    .attr('stroke', card)
    .attr('stroke-width', 1)
    .attr('pointer-events', 'none');
}

/**
 * HTML do tooltip de hover da macro -- mostra o coeficiente (mesmo
 * indicador colorido usado em todo o resto do app, "1,31x") e o rótulo de
 * status; extraído do handler `mousemove` de `MacroMap.tsx`.
 */
export function construirTooltipHtml(
  macroId: string | undefined,
  macro: Macrorregiao | undefined,
  row: CoberturaRow | undefined,
  produtividade: number,
  background: string,
): string {
  if (!macro) return `<strong>Código ${macroId ?? '—'}</strong><br>Sem dado nessa competência`;

  const meta = row ? statusMeta(row.status) : null;
  // statusMeta devolve `variant` semantico (nao hex) -- resolve pro hex
  // real da variavel CSS aqui, mesmo helper usado pro resto da cor
  // imperativa deste componente.
  const metaColor = meta ? resolveThemeColor(`--${meta.variant}`) : undefined;
  const coef = row ? calcularCoeficiente(row.oferta, macro.pop, produtividade) : null;

  return (
    `<strong>${macro.nome} (${macro.uf})</strong><br>Coeficiente: <span style="color:${coef?.corTexto ?? background}">` +
    `${coef?.valor != null ? formatMultiplicador(coef.valor) : '—'}</span>` +
    `<br><span style="color:${metaColor ?? background}">${meta?.label ?? ''}</span>`
  );
}

/**
 * Régua de escala (km reais) -- só no recorte (`featureAlvo`): sem paisagem
 * reconhecível atrás, não dá pra "sentir" se o raio desenhado está certo só
 * olhando. Mede o próprio pixel/km da projeção atual em vez de um valor
 * fixo -- cada macro tem escala diferente.
 */
export function desenharReguaEscala(
  svg: Svg,
  featureAlvo: Feature | undefined,
  proj: GeoProjection,
  height: number,
  card: string,
  foreground: string,
) {
  if (!featureAlvo) return;
  const [cLon, cLat] = geoCentroid(featureAlvo);
  const grausPorKmNaLatitude = 1 / (KM_POR_GRAU * Math.cos((cLat * Math.PI) / 180));
  const p0 = proj([cLon, cLat]);
  const p1 = proj([cLon + grausPorKmNaLatitude, cLat]);
  if (!p0 || !p1) return;

  const pxPorKm = Math.abs(p1[0] - p0[0]);
  const candidatos = [5, 10, 20, 25, 50, 100, 150, 200, 300, 500];
  const distanciaEscala = candidatos.find((km) => km * pxPorKm >= 60) ?? candidatos[candidatos.length - 1];
  const larguraBarra = distanciaEscala * pxPorKm;
  const x0 = 16;
  const y0 = height - 16;

  const escala = svg.append('g').attr('transform', `translate(${x0}, ${y0})`);
  escala
    .append('rect')
    .attr('x', -6)
    .attr('y', -22)
    .attr('width', larguraBarra + 12)
    .attr('height', 30)
    .attr('rx', 4)
    .attr('fill', card)
    .attr('fill-opacity', 0.85);
  escala.append('line').attr('x1', 0).attr('x2', larguraBarra).attr('y1', 0).attr('y2', 0).attr('stroke', foreground).attr('stroke-width', 2);
  escala.append('line').attr('x1', 0).attr('x2', 0).attr('y1', -4).attr('y2', 4).attr('stroke', foreground).attr('stroke-width', 2);
  escala
    .append('line')
    .attr('x1', larguraBarra)
    .attr('x2', larguraBarra)
    .attr('y1', -4)
    .attr('y2', 4)
    .attr('stroke', foreground)
    .attr('stroke-width', 2);
  escala
    .append('text')
    .attr('x', larguraBarra / 2)
    .attr('y', -8)
    .attr('text-anchor', 'middle')
    .attr('font-size', 10.5)
    .attr('font-weight', 700)
    .attr('fill', foreground)
    .text(`${distanciaEscala} km`);
}
