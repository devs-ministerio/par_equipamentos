import { describe, expect, it } from "vitest";
import { destinoDe, destinoSeguro } from "./destino-retorno";

describe("destinoSeguro", () => {
  it("aceita caminho interno com parâmetros e fragmento", () => {
    const d = "/monitoramento-equipamentos/painel?uf=SC&busca=Sa%C3%BAde#mapa";
    expect(destinoSeguro(d)).toBe(d);
  });
  it.each([
    "https://outro.site/x",
    "//outro.site/x",
    "/\\outro.site",
    "javascript:alert(1)",
    "relativo",
    "/login",
    "/login?x=1",
    "/a\nb",
    "",
    null,
    42,
  ])("recusa %s", (valor) => {
    expect(destinoSeguro(valor)).toBeNull();
  });
  it("monta o destino com busca e fragmento", () => {
    expect(destinoDe({ pathname: "/a", search: "?b=1", hash: "#c" })).toBe(
      "/a?b=1#c",
    );
  });
});
