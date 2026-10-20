import { vi } from "vitest";
import { criarMarcosInteracao } from "./monitoramento-interacoes";
import { prepararMesa } from "./monitoramento-mesa";

export const ROTAS_PAINEL = [
  "/monitoramento/instrumentos",
  "/monitoramento/resumo",
  "/monitoramento/marcos",
  "/convenios",
] as const;

export function prepararPainel(papel = "admin") {
  const h = prepararMesa();
  // Somente API de layout do navegador; componentes/D3 permanecem reais.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  h.respostas.set("/monitoramento/marcos", {
    body: criarMarcosInteracao(),
    status: 200,
  });
  h.respostas.set("/auth/me", {
    body: {
      id: 1,
      name: "Usuário sintético",
      email: "qa@example.invalid",
      role: papel,
      status: "active",
      created_at: "2026-10-20T10:00:00Z",
    },
    status: 200,
  });
  h.respostas.set("/geo/macrorregioes.geojson", {
    body: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { cod_macro: "Q1" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-50, -20],
                [-50, -10],
                [-40, -10],
                [-40, -20],
                [-50, -20],
              ],
            ],
          },
        },
      ],
    },
    status: 200,
  });
  h.respostas.set("/macro-coverage", { body: [], status: 200 });
  return h;
}
