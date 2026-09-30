import { describe, expect, it } from "vitest";
import { iniciaisDoNome } from "./iniciais";

describe("iniciaisDoNome", () => {
  it("usa primeiro nome + último sobrenome", () => {
    expect(iniciaisDoNome("IGOR PEREIRA LINS")).toBe("IL");
    expect(iniciaisDoNome("igor lins")).toBe("IL");
  });

  it("ignora conectivos de nome", () => {
    expect(iniciaisDoNome("Maria da Silva")).toBe("MS");
    expect(iniciaisDoNome("João dos Santos e Souza")).toBe("JS");
  });

  it("nome de uma palavra vira uma letra", () => {
    expect(iniciaisDoNome("Igor")).toBe("I");
  });

  it("preserva acento e tolera espaços extras", () => {
    expect(iniciaisDoNome("  Érica   Ávila  ")).toBe("ÉÁ");
  });

  it("nome vazio vira ?", () => {
    expect(iniciaisDoNome("")).toBe("?");
    expect(iniciaisDoNome(null)).toBe("?");
  });
});
