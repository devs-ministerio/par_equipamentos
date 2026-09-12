import { useEffect, useRef } from 'react';
import L from 'leaflet';

/**
 * Ciclo de vida do `L.Map` em si (container + tile layer + regua de escala)
 * -- criado UMA VEZ SO (deps `[]`), separado do ciclo de vida do CONTEUDO
 * (contorno/pontos, redesenhado sempre que o dado muda). Extraído de
 * `MacroMapReal.tsx`: ver docstring histórica lá sobre o bug real
 * corrigido 2026-08-23 (recriar o `L.Map` inteiro a cada troca de macro
 * estourava callbacks assíncronos do Leaflet numa instância já destruída).
 *
 * Devolve os refs (`mapRef`/`conteudoRef`) pro efeito de conteúdo do
 * componente popular -- essa separação é o que elimina a corrida.
 */
export function useLeafletMap(containerRef: React.RefObject<HTMLDivElement | null>) {
  const mapRef = useRef<L.Map | null>(null);
  const conteudoRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Guarda contra o StrictMode do React (dev) montar/desmontar/montar de
    // novo rapido -- Leaflet marca o container (`_leaflet_id`) na primeira
    // criacao e recusa `L.map()` de novo em cima sem isso ser limpo, mesmo
    // com o `map.remove()` do cleanup ja tendo rodado ("Map container is
    // already initialized"). Sem tipo oficial pro campo interno do
    // Leaflet, daí o cast.
    const elComEstadoLeaflet = el as HTMLDivElement & { _leaflet_id?: number };
    if (elComEstadoLeaflet._leaflet_id) {
      delete elComEstadoLeaflet._leaflet_id;
    }

    // View inicial obrigatoria (centro do Brasil, zoom baixo) -- sem isso o
    // mapa fica sem tamanho/posicao internos ate o fitBounds (no efeito de
    // conteudo) rodar, e qualquer chamada do Leaflet nesse meio tempo pode
    // estourar "Cannot read properties of undefined (reading 'min')".
    const map = L.map(el, { attributionControl: true, scrollWheelZoom: false }).setView([-14.235, -51.9253], 4);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    conteudoRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      conteudoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mapRef, conteudoRef };
}
