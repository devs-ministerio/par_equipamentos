import { afterEach, describe, expect, it } from "vitest";
import { limparTokenConta, resolverTokenConta } from "./token-conta";

afterEach(() => sessionStorage.clear());

describe("token de ativação/redefinição", () => {
  it("lê o token do fragmento do link", () => {
    expect(resolverTokenConta("activate", "#token=abc123")).toBe("abc123");
  });

  it("continua disponível depois de recarregar (fragmento já removido)", () => {
    resolverTokenConta("activate", "#token=abc123");
    expect(resolverTokenConta("activate", "")).toBe("abc123");
  });

  it("não mistura ativação com redefinição", () => {
    resolverTokenConta("activate", "#token=convite");
    expect(resolverTokenConta("reset", "")).toBe("");
  });

  it("link novo substitui o token guardado", () => {
    resolverTokenConta("reset", "#token=antigo");
    expect(resolverTokenConta("reset", "#token=novo")).toBe("novo");
    expect(resolverTokenConta("reset", "")).toBe("novo");
  });

  it("é apagado depois de concluir", () => {
    resolverTokenConta("reset", "#token=abc");
    limparTokenConta("reset");
    expect(resolverTokenConta("reset", "")).toBe("");
  });
});
