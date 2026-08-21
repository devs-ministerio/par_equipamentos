import { forwardRef, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { GeoJsonProperties, Geometry } from 'geojson';
import { ufNameToCode } from '../../data/geoReference';
import { statusMeta } from '../../utils/status';
import { formatMilhar } from '../../utils/format';

type Feature = GeoJSON.Feature<Geometry, GeoJsonProperties>;
type FeatureCollection = GeoJSON.FeatureCollection<Geometry, GeoJsonProperties>;

interface Props {
  geo: FeatureCollection;
  ufCobertura: Record<string, number>;
  ufPessoasPorTomografo: Record<string, number | null>;
  onSelectUf: (uf: string) => void;
}

/**
 * Mapa coropletico do Brasil (D3 + geojson por UF), colorido pela cobertura
 * media de cada estado. Desenha direto no DOM via useEffect (README, nota 2)
 * -- D3 manipula o SVG imperativamente, nao faz sentido re-renderizar via JSX.
 *
 * Encaminha o ref do container pra fora (forwardRef) pra permitir capturar o
 * <svg> renderizado e rasterizar pra PNG na exportacao de PDF (ver
 * utils/captureSvg.ts) -- sem isso nao ha como acessar o SVG desenhado pelo D3
 * de fora do componente.
 */
export const BrazilMap = forwardRef<HTMLDivElement, Props>(function BrazilMap(
  { geo, ufCobertura, ufPessoasPorTomografo, onSelectUf },
  encaminharRef,
) {
  const localRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el || !geo) return;
    el.innerHTML = '';
    el.style.position = 'relative';

    const width = el.clientWidth || 700;
    const height = 520;

    const svg = d3
      .select(el)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    const proj = d3.geoMercator().fitSize([width, height], geo);
    const path = d3.geoPath().projection(proj);

    const tooltip = document.createElement('div');
    tooltip.style.cssText =
      'position:absolute;background:#1a1a2e;color:#fff;padding:8px 12px;border-radius:8px;' +
      'font-size:12px;pointer-events:none;display:none;z-index:99;line-height:1.5;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    el.appendChild(tooltip);

    svg
      .selectAll('path')
      .data(geo.features)
      .enter()
      .append('path')
      .attr('d', path as unknown as (f: Feature) => string)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('cursor', 'pointer')
      .attr('fill', (d) => {
        const uf = ufNameToCode((d as Feature).properties?.name ?? '');
        const cob = uf ? ufCobertura[uf] : undefined;
        return cob == null ? '#e5e8ef' : statusMeta(cob).color;
      })
      .on('mousemove', (event: MouseEvent, d) => {
        const name = (d as Feature).properties?.name ?? '';
        const uf = ufNameToCode(name);
        const cob = uf ? ufCobertura[uf] : undefined;
        const pessoasPorTomografo = uf ? ufPessoasPorTomografo[uf] : undefined;
        const meta = cob != null ? statusMeta(cob) : null;
        const rect = el.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        tooltip.style.top = `${event.clientY - rect.top - 40}px`;
        tooltip.innerHTML = `<strong>${name} (${uf ?? '—'})</strong><br>Pessoas por tomógrafo: ${
          pessoasPorTomografo != null ? `${formatMilhar(pessoasPorTomografo)}/1` : '—'
        }<br><span style="color:${meta?.color ?? '#fff'}">${meta?.label ?? ''}</span>`;
      })
      .on('mouseleave', () => {
        tooltip.style.display = 'none';
      })
      .on('click', (_event: MouseEvent, d) => {
        const uf = ufNameToCode((d as Feature).properties?.name ?? '');
        if (uf) onSelectUf(uf);
      });

    svg
      .selectAll('text.uf-label')
      .data(geo.features)
      .enter()
      .append('text')
      .attr('class', 'uf-label')
      .attr('x', (d) => proj(d3.geoCentroid(d as Feature))?.[0] ?? 0)
      .attr('y', (d) => proj(d3.geoCentroid(d as Feature))?.[1] ?? 0)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', (d) => {
        const b = path.bounds(d as Feature);
        const w = b[1][0] - b[0][0];
        return w > 20 ? 10 : w > 10 ? 8 : 0;
      })
      .attr('font-weight', 600)
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text((d) => {
        const b = path.bounds(d as Feature);
        return b[1][0] - b[0][0] > 10 ? (ufNameToCode((d as Feature).properties?.name ?? '') ?? '') : '';
      });
  }, [geo, ufCobertura, ufPessoasPorTomografo, onSelectUf]);

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        if (typeof encaminharRef === 'function') encaminharRef(node);
        else if (encaminharRef) encaminharRef.current = node;
      }}
      style={{ width: '100%', minHeight: 520 }}
    />
  );
});
