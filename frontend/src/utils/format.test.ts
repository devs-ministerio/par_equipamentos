import { describe, expect, it } from "vitest";
import { formatMilhar, formatMultiplicador } from "./format";

describe("formatMilhar", () => {
  it("abaixo de 1000, mostra o inteiro puro", () => {
    expect(formatMilhar(0)).toBe("0");
    expect(formatMilhar(999)).toBe("999");
    expect(formatMilhar(542.7)).toBe("543"); // arredonda
  });

  it('a partir de 1000, mostra em "k" com 1 casa decimal e virgula BR', () => {
    expect(formatMilhar(1000)).toBe("1,0k");
    expect(formatMilhar(23400)).toBe("23,4k");
    expect(formatMilhar(1_650_000)).toBe("1650,0k");
  });
});

describe("formatMultiplicador", () => {
  it('formata com 2 casas decimais e "x", virgula BR', () => {
    expect(formatMultiplicador(3.9)).toBe("3,90x");
    expect(formatMultiplicador(1)).toBe("1,00x");
    expect(formatMultiplicador(0)).toBe("0,00x");
  });
});
