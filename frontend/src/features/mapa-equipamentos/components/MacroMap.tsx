import { forwardRef, useEffect, useRef } from 'react';
// Imports nomeados dos submodulos do D3 em vez de `import * as d3 from 'd3'`
// (2026-08-24) -- o metapacote 'd3' reexporta ~30 submodulos, a maioria
// nunca usada aqui (transicao, drag, zoom, force, etc.); isso sozinho
// tirou o D3 inteiro do chunk principal do build (ver App.tsx, rotas
// agora lazy) e reduz o que sobra so ao que este componente de fato chama.
import { max as d3Max } from 'd3-array';
import { geoCentroid, geoCircle, geoMercator, geoPath } from 'd3-geo';
import { scaleLinear, scaleSqrt } from 'd3-scale';
import { select } from 'd3-selection';
import type { GeoJsonProperties, Geometry } from 'geojson';
import { statusMeta } from '@/utils/status';
import { resolveThemeColor } from '@/lib/theme-colors';
import { formatMultiplicador } from '@/utils/format';
import { calcularCoeficiente } from '@/utils/coeficiente';
import type { CoberturaRow, Macrorregiao } from '@/types/domain';

type Feature = GeoJSON.Feature<Geometry, GeoJsonProperties>;
type FeatureCollection = GeoJSON.FeatureCollection<Geometry, GeoJsonProperties>;

export interface PontoEstabelecimento {
  cnes: string;
  lat: number;
  lon: number;
  qtd: number;
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

/** km -> graus de arco (o que geoCircle espera) -- 1 grau de grande
 * circulo na Terra equivale a raio_terra_km * (pi/180) km. */
const KM_POR_GRAU = (Math.PI / 180) * 6371;

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
  { geo, macros, coberturaRows, selectedMacroId, pontos, raioKm, zoomMacroId, produtividade = 100_000, onSelectMacro },
  encaminharRef,
) {
  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el || !geo) return;
    el.innerHTML = '';
    el.style.position = 'relative';

    const macroById = new Map(macros.map((m) => [m.id, m]));
    const coberturaById = new Map(coberturaRows.map((r) => [r.macroId, r]));

    // Lido 1x por render do efeito (nao por elemento/tick do D3) -- chamar
    // getComputedStyle em cada elemento de uma selecao .data().enter() faria
    // layout thrashing sem necessidade, o valor da variavel e o mesmo pra
    // todos os elementos desenhados nesta passada.
    const primary = resolveThemeColor('--primary');
    const foreground = resolveThemeColor('--foreground');
    const background = resolveThemeColor('--background');
    const card = resolveThemeColor('--card');
    const muted = resolveThemeColor('--muted');
    const mutedForeground = resolveThemeColor('--muted-foreground');
    const destructive = resolveThemeColor('--destructive');
    const destructiveBg = resolveThemeColor('--destructive-bg');
    const success = resolveThemeColor('--success');
    const successBg = resolveThemeColor('--success-bg');

    // Escala de cor em DUAS gradações, cortada exatamente no mesmo corte da
    // classificação oficial (coeficiente 1x = cobertura 100%, mesmo limiar
    // de `statusMeta` em utils/status.ts: `cobertura >= 100` =
    // Hiperssuficiente) -- 2026-08-24, substitui o gradiente único
    // (vermelho->laranja->verde) que passava por 100% sem nenhum corte
    // visual, dando a impressão de uma transição suave onde na verdade
    // existe uma classificação binária. Abaixo de 100%: gradação de
    // vermelho (mais escuro/saturado = mais longe da meta, mais claro =
    // quase lá). Igual ou acima de 100%: gradação de verde (mais claro =
    // acabou de bater a meta, mais escuro/saturado = bem acima).
    const escalaVermelho = scaleLinear<string>().domain([0, 100]).range([destructive, destructiveBg]).clamp(true);
    const escalaVerde = scaleLinear<string>().domain([100, 200]).range([successBg, success]).clamp(true);
    function escalaCor(cobertura: number): string {
      return cobertura < 100 ? escalaVermelho(cobertura) : escalaVerde(cobertura);
    }

    const width = el.clientWidth || 700;
    const height = 560;

    const svg = select(el)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

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

    const tooltip = document.createElement('div');
    tooltip.style.cssText =
      `position:absolute;background:${foreground};color:${background};padding:8px 12px;border-radius:8px;` +
      'font-size:12px;pointer-events:none;display:none;z-index:99;line-height:1.5;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    el.appendChild(tooltip);

    // Recortado (zoomMacroId) desenha SO a macro selecionada, sem as
    // vizinhas -- pedido explicito 2026-08-23 (antes desenhava geo.features
    // inteiro por baixo, so pra contexto geografico; ficou preferivel focar
    // so na area que importa, sem distrair com macro vizinha "cortada" na
    // borda do recorte).
    const featuresParaDesenhar = featureAlvo ? [featureAlvo] : geo.features;

    svg
      .selectAll('path')
      .data(featuresParaDesenhar)
      .enter()
      .append('path')
      .attr('d', path as unknown as (f: Feature) => string)
      .attr('stroke', card)
      .attr('stroke-width', (d) => ((d as Feature).properties?.cod_macro === selectedMacroId ? 2 : 0.6))
      .attr('cursor', 'pointer')
      .attr('fill', (d) => {
        const macroId = (d as Feature).properties?.cod_macro as string | undefined;
        const row = macroId ? coberturaById.get(macroId) : undefined;
        return row ? escalaCor(row.cobertura) : muted;
      })
      .on('mousemove', (event: MouseEvent, d) => {
        const macroId = (d as Feature).properties?.cod_macro as string | undefined;
        const macro = macroId ? macroById.get(macroId) : undefined;
        const row = macroId ? coberturaById.get(macroId) : undefined;
        const meta = row ? statusMeta(row.cobertura) : null;
        // statusMeta devolve `variant` semantico (nao hex) -- resolve pro
        // hex real da variavel CSS aqui, mesmo helper usado pro resto da
        // cor imperativa deste componente.
        const metaColor = meta ? resolveThemeColor(`--${meta.variant}`) : undefined;
        // Mesmo indicador colorido ("1,31x") usado em todo o resto do app
        // (StatusBadge/tabelas/cards) -- substitui "pessoas por
        // equipamento" (2026-08-24), que nao normalizava pela produtividade
        // da familia e nao batia com o numero mostrado em nenhum outro
        // lugar da tela.
        const coef = macro && row ? calcularCoeficiente(row.oferta, macro.pop, produtividade) : null;
        const rect = el.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        tooltip.style.top = `${event.clientY - rect.top - 40}px`;
        tooltip.innerHTML = macro
          ? `<strong>${macro.nome} (${macro.uf})</strong><br>Coeficiente: <span style="color:${coef?.corTexto ?? background}">${
              coef?.valor != null ? formatMultiplicador(coef.valor) : '—'
            }</span><br><span style="color:${metaColor ?? background}">${meta?.label ?? ''}</span>`
          : `<strong>Código ${macroId ?? '—'}</strong><br>Sem dado nessa competência`;
      })
      .on('mouseleave', () => {
        tooltip.style.display = 'none';
      })
      .on('click', (_event: MouseEvent, d) => {
        const macroId = (d as Feature).properties?.cod_macro as string | undefined;
        if (macroId) onSelectMacro(macroId);
      });

    // Raio normativo (75km do Tomografo) -- um circulo geodesico de verdade
    // por ponto SUS (geoCircle, nao um raio fixo em pixel: um raio fixo
    // em pixel ignoraria a distorcao da projecao Mercator, que estica muito
    // longe do equador -- 75km em pixel na Amazonia ficaria bem diferente
    // de 75km em pixel no Sul). So os pontos SUS (susFlag) tem raio -- o
    // criterio e sobre equipamento SUS, mesmo denominador de D-02.
    if (pontos && pontos.length > 0 && raioKm) {
      const raioGraus = raioKm / KM_POR_GRAU;
      const circulos = pontos
        .filter((p) => p.susFlag)
        .map((p) => geoCircle().center([p.lon, p.lat]).radius(raioGraus)());
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

    if (pontos && pontos.length > 0) {
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
        // decorativo -- o hover/clique continua sendo o poligono da macro
        // por baixo, senao um ponto pequeno em cima da borda "rouba" o
        // clique da macro.
        .attr('pointer-events', 'none');
    }

    // Regua de escala (km reais) -- so no recorte (zoomMacroId): sem
    // paisagem reconhecivel (rua, cidade) atras, nao da pra "sentir" se o
    // raio de 75km desenhado esta certo so olhando; uma regua com distancia
    // de verdade da essa referencia (2026-08-23). Mede o proprio pixel/km
    // da projecao atual em vez de um valor fixo -- cada macro tem escala
    // diferente (a macro unica do Acre e bem maior que uma macro pequena de
    // capital), entao o "tamanho de 1 km na tela" muda por recorte.
    if (featureAlvo) {
      const [cLon, cLat] = geoCentroid(featureAlvo);
      const grausPorKmNaLatitude = 1 / (KM_POR_GRAU * Math.cos((cLat * Math.PI) / 180));
      const p0 = proj([cLon, cLat]);
      const p1 = proj([cLon + grausPorKmNaLatitude, cLat]);
      if (p0 && p1) {
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
    }
  }, [geo, macros, coberturaRows, selectedMacroId, pontos, raioKm, zoomMacroId, produtividade, onSelectMacro]);

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        if (typeof encaminharRef === 'function') encaminharRef(node);
        else if (encaminharRef) encaminharRef.current = node;
      }}
      style={{ width: '100%', minHeight: 560 }}
    />
  );
});
