import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useDadosOficiaisFiltros } from "./use-dados-oficiais-filtros";

function montar(consulta = "?pagina=4&aba=componentes") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/${consulta}`]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ filtros: useDadosOficiaisFiltros(), local: useLocation() }),
    { wrapper },
  );
}

const recortes = [
  ["uf", "setUf", "uf", "BA"],
  ["municipio", "setMunicipio", "municipio", "SALVADOR"],
  ["cnes", "setCnes", "cnes", "0000001"],
  ["equipamento", "setEquipamento", "equipamento", "mamografo"],
  ["situacao", "setSituacao", "situacao", "Em execução"],
  ["anoInicio", "setAnoInicio", "ano_inicio", "2025"],
  ["anoFim", "setAnoFim", "ano_fim", "2026"],
  ["programa", "setPrograma", "programa", "Programa sintético"],
  ["tipoContratacao", "setTipoContratacao", "tipo_contratacao", "Convênio"],
  ["monitorado", "setMonitorado", "monitorado", "sim"],
  ["monitorado", "setMonitorado", "monitorado", "nao"],
] as const;

describe("recorte de Dados Oficiais refletido na URL", () => {
  it.each(["sim", "nao"])(
    "restaura Monitorado=%s e limpar preserva a navegação",
    (valor) => {
      const { result } = montar(`?monitorado=${valor}&pagina=3&aba=convenios`);
      expect(result.current.filtros.monitorado).toBe(valor);
      act(() => result.current.filtros.limparFiltros());
      expect(result.current.filtros.monitorado).toBeNull();
      expect(result.current.filtros.hasFiltros).toBe(false);
      expect(result.current.local.search).toBe("?aba=convenios");
    },
  );

  it.each(["", "true", "false", "desconhecido"])(
    "não interpreta valor inválido %s como Não",
    (valor) => {
      const { result } = montar(`?monitorado=${valor}`);
      expect(result.current.filtros.monitorado).toBeNull();
      act(() => result.current.filtros.setMonitorado(valor));
      expect(
        new URLSearchParams(result.current.local.search).has("monitorado"),
      ).toBe(false);
    },
  );

  it.each(["ANÁPOLIS", "anápolis", " anapolis "])(
    "restaura o município histórico %s sem reescrever a URL",
    (municipio) => {
      // Given / When
      const consulta = `?municipio=${encodeURIComponent(municipio)}&uf=GO`;
      const { result } = montar(consulta);
      // Then
      expect(result.current.filtros.municipio).toBe("anapolis");
      expect(result.current.local.search).toBe(consulta);
      expect(result.current.filtros.uf).toBe("GO");
    },
  );

  it.each(recortes)(
    "persiste %s e volta à primeira página sem perder a aba",
    (campo, setter, parametro, valor) => {
      // Arrange
      const { result } = montar();
      expect(result.current.filtros.pagina).toBe(4);
      // Act
      act(() => result.current.filtros[setter](valor));
      // Assert
      expect(result.current.filtros[campo]).toBe(
        campo === "municipio" ? "salvador" : valor,
      );
      expect(result.current.filtros.hasFiltros).toBe(true);
      expect(result.current.filtros.pagina).toBe(1);
      const params = new URLSearchParams(result.current.local.search);
      expect(params.get(parametro)).toBe(valor);
      expect(params.get("aba")).toBe("componentes");
      act(() => result.current.filtros[setter](null));
      expect(
        new URLSearchParams(result.current.local.search).has(parametro),
      ).toBe(false);
    },
  );

  it.each(["", "0", "-2", "1.5", "abc", "Infinity"])(
    "página inválida %s usa a primeira sem ativar filtros",
    (pagina) => {
      const { result } = montar(`?pagina=${pagina}`);
      expect(result.current.filtros.pagina).toBe(1);
      expect(result.current.filtros.hasFiltros).toBe(false);
      expect(result.current.filtros.pageSize).toBe(20);
    },
  );

  it("normaliza busca, muda de página e remove busca vazia", () => {
    const { result } = montar();
    act(() => result.current.filtros.setBusca("  Santa Casa & Saúde  "));
    expect(result.current.filtros.busca).toBe("Santa Casa & Saúde");
    act(() => result.current.filtros.setPagina(3));
    expect(result.current.filtros.pagina).toBe(3);
    act(() => result.current.filtros.setPagina(1));
    expect(new URLSearchParams(result.current.local.search).has("pagina")).toBe(
      false,
    );
    act(() => result.current.filtros.setBusca("   "));
    expect(result.current.filtros.busca).toBe("");
    expect(result.current.filtros.hasFiltros).toBe(false);
  });

  it("trocar classe remove equipamento incompatível e limpar preserva parâmetros de navegação", () => {
    const { result } = montar(
      "?equipamento=mamografo&uf=BA&pagina=4&aba=componentes",
    );
    act(() => result.current.filtros.setClasseEquipamento("outro"));
    expect(result.current.filtros.classeEquipamento).toBe("outro");
    expect(result.current.filtros.equipamento).toBeNull();
    expect(result.current.filtros.pagina).toBe(1);
    act(() => result.current.filtros.setClasseEquipamento("prioritario"));
    expect(new URLSearchParams(result.current.local.search).has("classe")).toBe(
      false,
    );
    act(() => result.current.filtros.limparFiltros());
    expect(result.current.local.search).toBe("?aba=componentes");
    expect(result.current.filtros.hasFiltros).toBe(false);
  });
});
