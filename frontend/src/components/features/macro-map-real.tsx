import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJsonProperties, Geometry } from "geojson";
import { resolveThemeColor } from "@/lib/theme-colors";
import { useLeafletMap } from "@/hooks/useLeafletMap";
import type { PontoEstabelecimento } from "./macro-map";

type Feature = GeoJSON.Feature<Geometry, GeoJsonProperties>;
type FeatureCollection = GeoJSON.FeatureCollection<Geometry, GeoJsonProperties>;

interface Props {
  geo: FeatureCollection;
  /** Contorno da macro desenhado quando presente. Omitir (modo `centro`,
   * ver abaixo) pula o contorno -- o recorte pode atravessar fronteira de
   * macro, entao desenhar SO o contorno de uma delas seria enganoso. */
  macroId?: string;
  pontos: PontoEstabelecimento[];
  /** Contorno REAL (poligono oficial, API de malhas do IBGE) do municipio
   * selecionado -- decisao 2026-08-24, a pedido explicito ("nao quero
   * circulo, quero de fato o contorno do municipio"): substitui o antigo
   * circulo de raio (75km normativo do Tomografo, ou raio de busca
   * generico pras demais familias) por essa geometria real, buscada sob
   * demanda em MapaPage.tsx (null enquanto carrega/se a busca falhar --
   * degrada bem, so fica sem desenhar nada extra alem do pin). */
  contornoMunicipio?: Feature | null;
  /** Pin marcando o municipio selecionado (sede) -- continua util mesmo
   * com o contorno real desenhado (mostra o ponto exato usado nos
   * calculos de distancia). */
  centro?: { lat: number; lon: number; nome?: string };
}

/**
 * Recorte de UMA macro sobre mapa de ruas de verdade (OpenStreetMap via
 * Leaflet) -- decisao 2026-08-23: usuario pediu "mapa real rodoviario" pra
 * conseguir CONFERIR visualmente o territorio contra paisagem reconhecivel
 * (cidade, estrada), coisa que o coropletico abstrato (MacroMap.tsx) nao
 * da. Uso direto do tile server publico do OSM (tile.openstreetmap.org),
 * sem conta/chave -- decisao explicita do usuario apos eu avisar que isso
 * tecnicamente viola a politica de uso deles pra producao real (pede
 * hospedagem propria ou provedor pago tipo MapTiler/Stadia); ok pra uso
 * atual, mas revisitar se o volume de acesso crescer. Atribuicao
 * "© OpenStreetMap contributors" e OBRIGATORIA (licenca ODbL), nao e so
 * cortesia -- nunca remover do controle de atribuicao do Leaflet.
 *
 * O `L.Map` e criado UMA VEZ SO (useEffect com deps []) e o CONTEUDO
 * (contorno, pontos, contorno do municipio) e redesenhado num segundo
 * useEffect sempre que os dados mudam -- NAO destroi/recria o mapa inteiro
 * a cada troca de macro. Bug real corrigido 2026-08-23: a versao anterior
 * recriava o L.Map inteiro a cada troca (macroId nas deps do MESMO efeito
 * que cria o mapa); trocar de macro rapido (varios cliques seguidos no
 * seletor) fazia callbacks assincronos do Leaflet (animacao de pan/zoom,
 * tile ainda carregando) de uma instancia ja destruida por `map.remove()`
 * estourarem "Cannot read properties of undefined (reading '_leaflet_pos')".
 * Separar "ciclo de vida do mapa" de "ciclo de vida do conteudo" elimina a
 * corrida.
 *
 * Cor via `resolveThemeColor` (src/lib/theme-colors.ts) -- Leaflet desenha
 * imperativamente (`L.geoJSON`/`L.circleMarker`), nao aceita `className`,
 * mesmo tratamento ja usado em MacroMap.tsx.
 */
export function MacroMapReal({
  geo,
  macroId,
  pontos,
  contornoMunicipio,
  centro,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ciclo de vida do L.Map em si (container + tile layer + regua de
  // escala), criado uma unica vez -- ver docstring de useLeafletMap.ts
  // sobre o bug real corrigido 2026-08-23 que motivou separar isso do
  // ciclo de vida do conteudo abaixo.
  const { mapRef, conteudoRef } = useLeafletMap(containerRef);

  // Redesenha SO o conteudo (contorno da macro, pontos, contorno do
  // municipio) sempre que os dados mudam -- o L.Map em si continua o mesmo
  // objeto, so limpa e repovoa o layerGroup.
  useEffect(() => {
    const map = mapRef.current;
    const conteudo = conteudoRef.current;
    if (!map || !conteudo) return;

    conteudo.clearLayers();

    // Lido 1x por render do efeito de conteudo (nao por camada/marcador) --
    // mesmo raciocinio de MacroMap.tsx: o valor da variavel de tema e o
    // mesmo pra tudo desenhado nesta passada, chamar getComputedStyle por
    // elemento seria layout thrashing sem necessidade.
    const primary = resolveThemeColor("--primary");
    const destructive = resolveThemeColor("--destructive");
    const card = resolveThemeColor("--card");
    const foreground = resolveThemeColor("--foreground");
    const mutedForeground = resolveThemeColor("--muted-foreground");

    // limites usados no fitBounds final. Com `contornoMunicipio` presente,
    // o contorno da macro inteira NAO entra nessa conta de proposito --
    // ele continua desenhado (usuario pediu pra manter, ver baixo), mas se
    // o fitBounds tivesse que caber a macro inteira o contorno do
    // municipio (bem menor) ficaria minusculo na tela, dando a impressao
    // de que ele nao apareceu (mesmo bug ja corrigido antes pro circulo de
    // raio, vale igual pro contorno real).
    const limites = L.latLngBounds([]);

    if (macroId) {
      const feature = geo.features.find(
        (f) => (f as Feature).properties?.cod_macro === macroId,
      );
      if (feature) {
        const contorno = L.geoJSON(feature as GeoJSON.Feature, {
          style: {
            color: primary,
            weight: 2,
            fillOpacity: 0.04,
            fillColor: primary,
          },
        }).addTo(conteudo);
        if (!contornoMunicipio) {
          limites.extend(contorno.getBounds());
        }
      }
    }

    if (contornoMunicipio) {
      // Contorno REAL do municipio (poligono oficial do IBGE) -- substitui
      // o circulo de raio antigo (2026-08-24, a pedido). Vermelho
      // tracejado, preenchimento bem leve so pra destacar a area sem
      // esconder o mapa de ruas por baixo.
      const contornoMun = L.geoJSON(contornoMunicipio, {
        style: {
          color: destructive,
          weight: 2.5,
          fillOpacity: 0.08,
          fillColor: destructive,
          dashArray: "6 5",
        },
      }).addTo(conteudo);
      limites.extend(contornoMun.getBounds());
    }

    if (centro) {
      const marcadorCentro = L.circleMarker([centro.lat, centro.lon], {
        radius: 6,
        color: card,
        weight: 2,
        fillColor: destructive,
        fillOpacity: 1,
      })
        .bindTooltip(
          centro.nome ? `Município: ${centro.nome}` : "Município selecionado",
        )
        .addTo(conteudo);
      limites.extend(marcadorCentro.getLatLng());
    }

    const maiorQtd = Math.max(...pontos.map((p) => p.qtd), 1);
    pontos.forEach((p) => {
      const raioPx = 4 + (Math.sqrt(p.qtd) / Math.sqrt(maiorQtd)) * 6;
      const marcador = L.circleMarker([p.lat, p.lon], {
        radius: raioPx,
        color: card,
        weight: 1,
        fillColor: p.susFlag ? foreground : mutedForeground,
        fillOpacity: 0.9,
      })
        // HTML no tooltip (Leaflet renderiza por padrao) -- nome/municipio
        // vem do proprio banco (equipment_offer_row), mesmo padrao ja
        // usado no tooltip do mapa nacional (MacroMap.tsx). Pedido
        // explicito 2026-08-24: alem da qtd/CNES que ja tinha, mostrar
        // nome do estabelecimento, municipio e UF.
        .bindTooltip(
          `<strong>${p.nome ?? "(sem nome cadastrado)"}</strong><br>` +
            `CNES ${p.cnes}<br>` +
            `${p.municipio ?? "—"}${p.uf ? ` (${p.uf})` : ""}<br>` +
            `${p.qtd} equipamento${p.qtd === 1 ? "" : "s"}`,
        )
        .addTo(conteudo);
      limites.extend(marcador.getLatLng());
    });

    // Bug real visto 2026-08-24: em macros pequenas (ex.: PI · 2209 ·
    // LITORAL, uma faixa litoranea estreita), o mapa as vezes ficava preso
    // na visao inicial (Brasil inteiro, zoom 4) em vez de enquadrar o
    // contorno -- fitBounds chamado no MESMO frame em que o container acaba
    // de ganhar layout real (primeira montagem via Suspense/lazy, ou logo
    // apos o fallback "Carregando mapa..." sair) mede o tamanho do
    // container ANTES do reflow do navegador terminar, entao calcula o
    // zoom errado. Adiar pro proximo frame (requestAnimationFrame) garante
    // que o container ja tem layout final quando o Leaflet mede -- padrao
    // conhecido de Leaflet dentro de React pra esse sintoma especifico
    // (fitBounds "gruda" na visao default). Cancela o frame pendente se o
    // efeito rodar de novo antes dele disparar (troca rapida de
    // macro/municipio) pra nao aplicar um fitBounds desatualizado por cima
    // do conteudo novo.
    const rafId = requestAnimationFrame(() => {
      map.invalidateSize();
      if (limites.isValid()) {
        // stop() cancela qualquer voo (pan+zoom animado) ainda em andamento
        // de uma troca anterior -- sem isso, trocar de macro/municipio
        // rapido (ex.: AC pra BA, do outro lado do pais) empilhava
        // animacoes: o fitBounds novo comecava a MEIO da animacao antiga
        // ainda em curso, entao o mapa vinha de um ponto/zoom intermediario
        // errado, dava um "salto" visual, ou ficava preso num zoom que nao
        // era nem o de origem nem o de destino. animate:false torna a
        // transicao instantanea (bug real visto 2026-08-24, "problemas no
        // zoom na transicao entre macrorregioes") -- uma macro pode estar
        // a milhares de km da anterior, entao animar o voo nao ajudava em
        // nada mesmo (so mostrava oceano/terra passando rapido).
        map.stop();
        map.fitBounds(limites, {
          padding: [24, 24],
          maxZoom: 12,
          animate: false,
        });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [geo, macroId, pontos, contornoMunicipio, centro, mapRef, conteudoRef]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 560,
        borderRadius: 8,
        overflow: "hidden",
      }}
    />
  );
}
