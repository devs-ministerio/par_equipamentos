import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRelatorioInstrumentosFiltros } from "./use-relatorio-instrumentos-filtros";

const recortes = [
  ["uf", "setUf", "BA"],
  ["situacao", "setSituacao", "Em execução"],
  ["anoInicio", "setAnoInicio", "2025"],
  ["anoFim", "setAnoFim", "2026"],
  ["programa", "setPrograma", "Programa sintético"],
  ["tipoContratacao", "setTipoContratacao", "Convênio"],
  ["equipamento", "setEquipamento", "mamografo"],
  ["municipio", "setMunicipio", "SALVADOR"],
  ["cnes", "setCnes", "0000001"],
  ["nomeEstabelecimento", "setNomeEstabelecimento", "Instituição sintética"],
] as const;

describe("estado dos filtros do relatório", () => {
  it.each(recortes)(
    "reconhece o recorte isolado %s e consegue limpá-lo",
    (campo, setter, valor) => {
      // Arrange
      const { result } = renderHook(useRelatorioInstrumentosFiltros);
      expect(result.current.hasFiltros).toBe(false);
      // Act
      act(() => result.current[setter](valor));
      // Assert
      expect(result.current[campo]).toBe(valor);
      expect(result.current.hasFiltros).toBe(true);
      act(() => result.current.limparFiltros());
      expect(result.current[campo]).toBeNull();
      expect(result.current.hasFiltros).toBe(false);
    },
  );

  it("limpa todos os recortes e mantém instâncias independentes sem busca livre", () => {
    const principal = renderHook(useRelatorioInstrumentosFiltros);
    const outra = renderHook(useRelatorioInstrumentosFiltros);
    act(() => {
      for (const [, setter, valor] of recortes)
        principal.result.current[setter](valor);
    });
    expect(outra.result.current.hasFiltros).toBe(false);
    expect(principal.result.current).not.toHaveProperty("busca");
    act(() => principal.result.current.limparFiltros());
    expect(recortes.map(([campo]) => principal.result.current[campo])).toEqual(
      Array(10).fill(null),
    );
  });
});
