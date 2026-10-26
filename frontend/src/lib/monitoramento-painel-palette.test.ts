import { describe, expect, it } from "vitest";
import { colors } from "@/styles/tokens";
import { PALETA_CATEGORICA } from "./monitoramento-painel-palette";

function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

describe("paleta categórica do painel", () => {
  const hex = PALETA_CATEGORICA.map((valor) => {
    const nome = valor.replace("var(--painel-chart-", "").replace(")", "");
    const chave =
      `painelChart${nome[0].toUpperCase()}${nome.slice(1)}` as keyof typeof colors;
    return colors[chave] as string;
  });

  it("espelha o tokens.ts para todas as séries", () => {
    expect(hex.every((c) => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
  });

  it("não tem duas cores parecidas no mesmo gráfico", () => {
    for (let i = 0; i < hex.length; i++) {
      for (let j = i + 1; j < hex.length; j++) {
        const [a, b] = [lab(hex[i]), lab(hex[j])];
        const distancia = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(distancia, `${hex[i]} x ${hex[j]}`).toBeGreaterThanOrEqual(25);
      }
    }
  });
});
