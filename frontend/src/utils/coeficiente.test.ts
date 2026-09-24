import { describe, expect, it } from "vitest";
import { calcularCoeficiente } from "./coeficiente";

describe("calcularCoeficiente", () => {
  it("usa a produtividade passada, nao um valor fixo -- bug real corrigido 2026-08-21 (5 call sites tinham 100_000 hardcoded, RESSONANCIA saia com coeficiente errado)", () => {
    // RESSONANCIA: 1 equipamento SUS, produtividade 166_667, pop 100_000 -- deveria dar bem mais que 1x
    const ressonancia = calcularCoeficiente(1, 100_000, 166_667);
    const tomografoMesmosNumeros = calcularCoeficiente(1, 100_000, 100_000);
    expect(ressonancia.valor).not.toBeNull();
    expect(ressonancia.valor).not.toBeCloseTo(
      tomografoMesmosNumeros.valor ?? -1,
    );
    expect(ressonancia.valor).toBeCloseTo(1.66667, 4);
  });

  it("pop=0 -- sem denominador, retorna valor null (nao Infinity/NaN)", () => {
    const r = calcularCoeficiente(5, 0, 100_000);
    expect(r.valor).toBeNull();
    expect(r.hiper).toBe(false);
    expect(r.fillPercent).toBe(0);
  });

  it("coeficiente exatamente 1 -- fronteira Hipo/Hiper, hiper deve ser true (>=1, nao >1)", () => {
    const r = calcularCoeficiente(1, 100_000, 100_000);
    expect(r.valor).toBe(1);
    expect(r.hiper).toBe(true);
  });

  it("coeficiente logo abaixo de 1 -- Hipossuficiente", () => {
    const r = calcularCoeficiente(1, 100_001, 100_000);
    expect(r.hiper).toBe(false);
  });

  it("fillPercent nunca passa de 100 mesmo com coeficiente bem alto (Hiperssuficiente extremo)", () => {
    const r = calcularCoeficiente(10, 10_000, 100_000); // coeficiente = 100
    expect(r.fillPercent).toBe(100);
  });

  it("fillPercent fica em 50 exatamente no coeficiente 1 (listra central da barra)", () => {
    const r = calcularCoeficiente(1, 100_000, 100_000);
    expect(r.fillPercent).toBe(50);
  });
});
