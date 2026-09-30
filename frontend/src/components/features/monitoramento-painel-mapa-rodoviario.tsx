import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { useLeafletMap } from "@/hooks/useLeafletMap";
import type { LocalInstrumentos } from "@/lib/monitoramento-geografia";
import { resolveThemeColor } from "@/lib/theme-colors";

type GeoMacrorregioes = FeatureCollection<Geometry, GeoJsonProperties>;

function popupDoLocal(local: LocalInstrumentos) {
  const popup = document.createElement("div");
  popup.className = "max-w-72 p-1 font-sans";
  const titulo = document.createElement("p");
  titulo.className = "text-sm font-semibold text-foreground";
  titulo.textContent =
    local.instrumentos.length === 1
      ? local.instrumentos[0].instrumento.nome_convenente
      : `${local.instrumentos.length} instrumentos nesta localização`;
  popup.appendChild(titulo);

  const lista = document.createElement("ul");
  lista.className = "mt-2 max-h-60 divide-y divide-border overflow-y-auto";
  for (const { instrumento } of local.instrumentos) {
    const item = document.createElement("li");
    item.className = "py-2";
    const link = document.createElement("a");
    link.href = `/monitoramento-equipamentos/instrumentos/${encodeURIComponent(instrumento.nr_convenio)}`;
    link.className =
      "text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
    link.textContent = `${instrumento.nr_convenio} · ${instrumento.nome_convenente}`;
    const equipamento = document.createElement("p");
    equipamento.className = "mt-1 text-xs text-foreground";
    equipamento.textContent =
      instrumento.equipamento_descricao ?? "Equipamento não informado";
    const detalhe = document.createElement("p");
    detalhe.className = "mt-1 text-[11px] text-muted-foreground";
    detalhe.textContent = `CNES ${instrumento.cnes ?? "não informado"} · ${instrumento.fase_atual ?? "Não iniciado"}`;
    const tecnico = document.createElement("p");
    tecnico.className = "mt-1 text-[11px] text-muted-foreground";
    tecnico.textContent = `Técnico: ${instrumento.tecnico_titular ?? "Não atribuído"}`;
    item.append(link, equipamento, detalhe, tecnico);
    lista.appendChild(item);
  }
  popup.appendChild(lista);
  return popup;
}

export function MonitoramentoPainelMapaRodoviario({
  geo,
  macroId,
  locais,
}: {
  geo: GeoMacrorregioes;
  macroId: string;
  locais: LocalInstrumentos[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { mapRef, conteudoRef } = useLeafletMap(containerRef);

  useEffect(() => {
    const map = mapRef.current;
    const conteudo = conteudoRef.current;
    if (!map || !conteudo) return;
    conteudo.clearLayers();

    const primary = resolveThemeColor("--primary");
    const feature = geo.features.find(
      (item) => item.properties?.cod_macro === macroId,
    );
    const limites = L.latLngBounds([]);
    if (feature) {
      const contorno = L.geoJSON(feature as GeoJSON.Feature, {
        style: {
          color: primary,
          weight: 2,
          fillColor: primary,
          fillOpacity: 0.04,
        },
      }).addTo(conteudo);
      limites.extend(contorno.getBounds());
    }

    for (const local of locais.filter((item) => item.macroId === macroId)) {
      const selo = document.createElement("span");
      selo.className =
        "grid size-7 place-items-center rounded-full border-2 border-card bg-foreground font-data text-[11px] font-bold text-card";
      selo.textContent =
        local.instrumentos.length > 1 ? String(local.instrumentos.length) : "";
      const marcador = L.marker([local.latitude, local.longitude], {
        icon: L.divIcon({
          className: "",
          html: selo,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        title: `${local.instrumentos.length} ${local.instrumentos.length === 1 ? "instrumento" : "instrumentos"} nesta localização`,
        keyboard: true,
      })
        .bindPopup(popupDoLocal(local), { maxWidth: 320 })
        .addTo(conteudo);
      limites.extend(marcador.getLatLng());
    }

    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      map.stop();
      if (limites.isValid()) {
        map.fitBounds(limites, {
          padding: [24, 24],
          maxZoom: 12,
          animate: false,
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [geo, macroId, locais, mapRef, conteudoRef]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Mapa rodoviário da macrorregião ${macroId}`}
      className="h-[410px] w-full overflow-hidden bg-muted sm:h-[500px]"
    />
  );
}
