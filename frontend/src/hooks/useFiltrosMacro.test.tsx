import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { criarBaseTerritorial } from "@/test-fixtures/filtros-territoriais";
import { useFiltrosMacro } from "./useFiltrosMacro";

type Inicial = NonNullable<Parameters<typeof useFiltrosMacro>[0]["inicial"]>;
const orfaos: [string, Inicial][] = [
  ["CNES", { cnes: ["ausente"] }],
  ["município", { municipios: ["Ausente|BA"] }],
  ["região de saúde", { regioesSaude: ["ausente"] }],
];

describe("recorte territorial sem correspondência", () => {
  it.each(orfaos)(
    "%s órfão não volta silenciosamente ao Brasil",
    (_, inicial) => {
      // Arrange / Act
      const { result } = renderHook(() =>
        useFiltrosMacro({ ...criarBaseTerritorial(), inicial }),
      );
      // Assert
      expect(result.current.hasAnyFilter).toBe(true);
      expect(result.current.filteredRows).toEqual([]);
    },
  );

  it("perder um CNES na atualização da base não exibe os outros da mesma macro", () => {
    // Arrange
    const base = criarBaseTerritorial();
    const { result, rerender } = renderHook(
      ({ facilities }) =>
        useFiltrosMacro({
          ...base,
          facilities,
          inicial: { cnes: ["0000001"] },
        }),
      { initialProps: { facilities: base.facilities } },
    );
    expect(result.current.filteredRows).toEqual([base.coberturaRows[0]]);
    // Act
    rerender({
      facilities: base.facilities.filter((f) => f.cnes !== "0000001"),
    });
    // Assert
    expect(result.current.filtroCnes).toEqual(["0000001"]);
    expect(result.current.filteredRows).toEqual([]);
    act(() => result.current.limparFiltros());
    expect(result.current.filteredRows).toEqual(base.coberturaRows.slice(0, 4));
  });

  it("CNES conhecido mas sem macro não inventa uma ligação territorial", () => {
    // Arrange / Act
    const base = criarBaseTerritorial();
    const { result } = renderHook(() =>
      useFiltrosMacro({ ...base, inicial: { cnes: ["0000006"] } }),
    );
    // Assert
    expect(result.current.filtroUfs).toEqual(["BA"]);
    expect(result.current.filtroMacros).toEqual([]);
    expect(result.current.filteredRows).toEqual([]);
  });
});

describe("estado e cascata territorial com hook real", () => {
  it("sem filtro preserva os indicadores recebidos e exclui apenas linha sem macro cadastrada", () => {
    // Arrange
    const base = criarBaseTerritorial();
    const { result } = renderHook(() => useFiltrosMacro(base));
    // Act / Assert
    expect(result.current.filteredRows).toEqual(base.coberturaRows.slice(0, 4));
    expect(result.current.filteredRows[0]).toBe(base.coberturaRows[0]);
    expect(result.current.hasAnyFilter).toBe(false);
    expect(result.current.filtrosResumo).toBe("");
    expect(result.current.estadosFiltro).toBeUndefined();
    expect(result.current.macrosFiltro).toBeUndefined();
    expect(result.current.regioesSaudeFiltro).toBeUndefined();
    expect(result.current.municipiosFiltro).toBeUndefined();
    expect(result.current.cnesFiltro).toBeUndefined();
    expect(result.current.ufOptions).toEqual(
      ["BA", "PE", "SP"].map((uf) => ({ value: uf, label: uf })),
    );
    expect(result.current.macroOptions).toHaveLength(4);
    expect(result.current.regiaoSaudeOptions).toHaveLength(4);
    expect(result.current.municipioOptions).toHaveLength(4);
    expect(result.current.cnesOptions).toHaveLength(6);
  });

  const selecoes: [string, Inicial, string[]][] = [
    ["região", { regioes: ["Nordeste"] }, ["QBA1", "QBA2", "QPE"]],
    ["UF", { ufs: ["BA"] }, ["QBA1", "QBA2"]],
    ["macro", { macros: ["QBA1"] }, ["QBA1"]],
    ["região de saúde", { regioesSaude: ["RS1"] }, ["QBA1"]],
    ["município", { municipios: ["Cidade Um|BA"] }, ["QBA1"]],
    ["CNES", { cnes: ["0000001"] }, ["QBA1"]],
  ];
  it.each(selecoes)(
    "seleciona linhas por %s e limpa todas as dimensões",
    (_, inicial, ids) => {
      // Arrange / Act
      const base = criarBaseTerritorial();
      const { result } = renderHook(() =>
        useFiltrosMacro({ ...base, inicial }),
      );
      // Assert
      expect(result.current.hasAnyFilter).toBe(true);
      expect(result.current.filteredRows.map((r) => r.macroId)).toEqual(ids);
      act(() => result.current.limparFiltros());
      expect(result.current.filteredRows).toEqual(
        base.coberturaRows.slice(0, 4),
      );
      expect(result.current.hasAnyFilter).toBe(false);
      expect(result.current.filtrosResumo).toBe("");
      expect([
        result.current.filtroCnes,
        result.current.filtroMunicipios,
        result.current.filtroRegioesSaude,
        result.current.filtroMacros,
        result.current.filtroUfs,
        result.current.filtroRegioes,
      ]).toEqual([[], [], [], [], [], []]);
    },
  );

  it("converte região em UFs únicas e respeita a UF explícita", () => {
    // Arrange
    const base = criarBaseTerritorial();
    const { result } = renderHook(() => useFiltrosMacro(base));
    // Act / Assert
    act(() => result.current.setFiltroRegioes(["Nordeste"]));
    expect(result.current.estadosFiltro).toEqual(["BA", "PE"]);
    expect(result.current.filtrosResumo).toBe("Região: Nordeste");
    act(() => result.current.setFiltroUfs(["BA"]));
    expect(result.current.estadosFiltro).toEqual(["BA"]);
    expect(result.current.filteredRows.map((r) => r.macroId)).toEqual([
      "QBA1",
      "QBA2",
    ]);
  });

  it("CNES implica território e não duplica filtros após re-render", () => {
    // Arrange
    const base = criarBaseTerritorial();
    const { result, rerender } = renderHook(() => useFiltrosMacro(base));
    // Act
    act(() => result.current.setFiltroCnes(["0000001", "0000002"]));
    rerender();
    // Assert
    expect(result.current.filtroRegioes).toEqual(["Nordeste"]);
    expect(result.current.estadosFiltro).toEqual(["BA"]);
    expect(result.current.macrosFiltro).toEqual(["QBA1"]);
    expect(result.current.regioesSaudeFiltro).toEqual(["RS1"]);
    expect(result.current.municipiosFiltro).toEqual(["Cidade Um|BA"]);
    expect(result.current.cnesFiltro).toEqual(["0000001", "0000002"]);
    expect(result.current.filtrosResumo).toBe(
      "Região: Nordeste | UF: BA | Macrorregião: QBA1 · Macro sintética QBA1 (BA) | Região de saúde: RS1 · Região sintética RS1 (BA) | Município: Cidade Um (BA) | CNES: Unidade sintética 0000001 · CNES 0000001 (BA), Unidade sintética 0000002 · CNES 0000002 (BA)",
    );
    act(() => result.current.setFiltroCnes([]));
    expect(result.current.filtroMunicipios).toEqual(["Cidade Um|BA"]);
    expect(result.current.filtroMacros).toEqual(["QBA1"]);
  });

  it("acrescenta territórios implicados sem apagar uma seleção manual", () => {
    // Arrange
    const base = criarBaseTerritorial();
    const { result } = renderHook(() =>
      useFiltrosMacro({
        ...base,
        inicial: { ufs: ["SP"], regioes: ["Sudeste"] },
      }),
    );
    // Act
    act(() => result.current.setFiltroCnes(["0000001", "0000005"]));
    // Assert
    expect(result.current.filtroUfs).toEqual(["SP", "BA"]);
    expect(result.current.filtroRegioes).toEqual(["Sudeste", "Nordeste"]);
    expect(result.current.filtroMacros).toEqual(["QBA1", "QSP"]);
    expect(result.current.filtroRegioesSaude).toEqual(["RS1", "RS4"]);
    expect(result.current.filtroMunicipios).toEqual([
      "Cidade Um|BA",
      "Cidade Quatro|SP",
    ]);
    expect(result.current.filteredRows.map((r) => r.macroId)).toEqual([
      "QBA1",
      "QSP",
    ]);
  });

  it("cada opção ignora seu próprio seletor mas respeita os demais", () => {
    // Arrange
    const base = criarBaseTerritorial();
    const { result } = renderHook(() => useFiltrosMacro(base));
    // Act
    act(() => result.current.setFiltroUfs(["BA"]));
    // Assert
    expect(result.current.ufOptions.map((o) => o.value)).toEqual([
      "BA",
      "PE",
      "SP",
    ]);
    expect(result.current.macroOptions.map((o) => o.value)).toEqual([
      "QBA1",
      "QBA2",
    ]);
    expect(result.current.cnesOptions.map((o) => o.value)).toEqual([
      "0000006",
      "0000001",
      "0000002",
      "0000003",
    ]);
    act(() => result.current.setFiltroMacros(["QBA1"]));
    expect(result.current.macroOptions.map((o) => o.value)).toEqual([
      "QBA1",
      "QBA2",
    ]);
    act(() => result.current.setFiltroRegioesSaude(["RS1"]));
    act(() => result.current.setFiltroMunicipios(["Cidade Um|BA"]));
    act(() => result.current.setFiltroCnes(["0000001"]));
    expect(result.current.cnesOptions.map((o) => o.value)).toEqual([
      "0000001",
      "0000002",
    ]);
    expect(result.current.regiaoSaudeOptions.map((o) => o.value)).toEqual([
      "RS1",
    ]);
    expect(result.current.municipioOptions.map((o) => o.value)).toEqual([
      "Cidade Um|BA",
    ]);
  });

  it("instâncias da página e exportação mantêm seleções independentes", () => {
    // Arrange
    const base = criarBaseTerritorial();
    const { result } = renderHook(() => ({
      pagina: useFiltrosMacro(base),
      exportacao: useFiltrosMacro(base),
    }));
    // Act
    act(() => result.current.pagina.setFiltroCnes(["0000001"]));
    act(() => result.current.exportacao.setFiltroUfs(["SP"]));
    // Assert
    expect(result.current.pagina.filteredRows.map((r) => r.macroId)).toEqual([
      "QBA1",
    ]);
    expect(
      result.current.exportacao.filteredRows.map((r) => r.macroId),
    ).toEqual(["QSP"]);
    act(() => result.current.exportacao.limparFiltros());
    expect(result.current.pagina.filtroCnes).toEqual(["0000001"]);
    expect(result.current.exportacao.hasAnyFilter).toBe(false);
  });

  it("base vazia mantém recorte vazio e IDs desconhecidos legíveis no resumo", () => {
    // Arrange / Act
    const inicial = {
      cnes: ["CNES-AUSENTE"],
      municipios: ["Cidade Ausente|BA"],
      regioesSaude: ["RS-AUSENTE"],
      macros: ["MACRO-AUSENTE"],
    };
    const { result } = renderHook(() =>
      useFiltrosMacro({
        macros: [],
        coberturaRows: [],
        facilities: [],
        inicial,
      }),
    );
    // Assert
    expect(result.current.filteredRows).toEqual([]);
    expect(result.current.cnesOptions).toEqual([]);
    expect(result.current.filtrosResumo).toBe(
      "Macrorregião: MACRO-AUSENTE | Região de saúde: RS-AUSENTE | Município: Cidade Ausente|BA | CNES: CNES-AUSENTE",
    );
  });

  it("nomes territoriais ausentes usam os IDs sem inventar nomes", () => {
    // Arrange
    const base = criarBaseTerritorial();
    base.facilities = [
      { ...base.facilities[0], macroNome: null, regiaoSaudeNome: null },
    ];
    // Act
    const { result } = renderHook(() =>
      useFiltrosMacro({ ...base, inicial: { cnes: ["0000001"] } }),
    );
    // Assert
    expect(result.current.macroOptions).toEqual([
      { value: "QBA1", label: "QBA1 · QBA1 (BA)" },
    ]);
    expect(result.current.regiaoSaudeOptions).toEqual([
      { value: "RS1", label: "RS1 · RS1 (BA)" },
    ]);
  });

  it("dimensões incompatíveis retornam vazio sem remover escolhas manuais", () => {
    // Arrange / Act
    const base = criarBaseTerritorial();
    const { result } = renderHook(() =>
      useFiltrosMacro({
        ...base,
        inicial: { regioes: ["Nordeste"], ufs: ["SP"] },
      }),
    );
    // Assert
    expect(result.current.filteredRows).toEqual([]);
    expect(result.current.filtroRegioes).toEqual(["Nordeste"]);
    expect(result.current.filtroUfs).toEqual(["SP"]);
  });

  it("UF desconhecida não recebe região inferida e é excluída ao filtrar região", () => {
    // Arrange
    const base = criarBaseTerritorial();
    base.facilities = [{ ...base.facilities[5], uf: "XX" }];
    const { result } = renderHook(() =>
      useFiltrosMacro({ ...base, inicial: { cnes: ["0000006"] } }),
    );
    expect(result.current.filtroUfs).toEqual(["XX"]);
    expect(result.current.filtroRegioes).toEqual([]);
    // Act
    act(() => result.current.setFiltroRegioes(["Nordeste"]));
    // Assert
    expect(result.current.ufOptions).toEqual([]);
    expect(result.current.cnesOptions).toEqual([]);
    expect(result.current.filteredRows).toEqual([]);
  });
});
