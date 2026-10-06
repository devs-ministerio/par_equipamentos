import { describe, expect, it } from "vitest";
import { destinoDeRetorno, urlDetalheInstrumento } from "./navegacao-retorno";

describe("navegação de retorno", () => {
  it("preserva filtros e paginação de uma origem permitida", () => {
    const retorno = destinoDeRetorno(
      "?retorno=%2Fmonitoramento-equipamentos%3Fuf%3DMG%26pagina%3D2",
      "/monitoramento-equipamentos/instrumentos",
    );

    expect(retorno).toEqual({
      href: "/monitoramento-equipamentos?uf=MG&pagina=2",
      rotulo: "Instrumentos e repasses",
    });
  });

  it("rejeita destino externo e usa a origem segura padrão", () => {
    expect(
      destinoDeRetorno(
        "?retorno=https%3A%2F%2Fsite-malicioso.example%2F",
        "/monitoramento-equipamentos/instrumentos",
      ),
    ).toEqual({
      href: "/monitoramento-equipamentos/instrumentos",
      rotulo: "Mesa de trabalho",
    });
  });

  it("não propaga retorno que não seja uma rota de lista conhecida", () => {
    expect(
      urlDetalheInstrumento(
        "953749",
        "/monitoramento-equipamentos/instrumentos/123",
      ),
    ).toBe("/monitoramento-equipamentos/instrumentos/953749");
  });
});
