import { describe, expect, it } from "vitest";
import { correspondeBuscaLivre } from "./busca-livre";

describe("correspondeBuscaLivre", () => {
  it("ignora caixa, acentos e espaços nas bordas", () => {
    expect(
      correspondeBuscaLivre("  sao  ", ["Hospital São Vicente", "1234567"]),
    ).toBe(true);
  });

  it("encontra identificadores sem misturar campos diferentes", () => {
    expect(correspondeBuscaLivre("1234567", ["Hospital", "1234567"])).toBe(
      true,
    );
    expect(correspondeBuscaLivre("hospital 123", ["Hospital", "1234567"])).toBe(
      false,
    );
  });

  it("não restringe o conjunto quando o texto está vazio", () => {
    expect(correspondeBuscaLivre("   ", [null])).toBe(true);
  });
});
