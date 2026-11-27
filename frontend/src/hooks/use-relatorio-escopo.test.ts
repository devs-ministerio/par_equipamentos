import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRelatorioEscopo } from "@/hooks/use-relatorio-escopo";
import type { ConvenioUnificado } from "@/types/monitoramento";

type Filtros = Parameters<typeof useRelatorioEscopo>[0];

const filtrosVazios = {
  uf: null,
  anoInicio: null,
  anoFim: null,
  programa: null,
  tipoContratacao: null,
  equipamento: null,
  municipio: null,
  cnes: null,
  nomeEstabelecimento: null,
} as unknown as Filtros;

const convenio = (extra: Record<string, unknown>) =>
  ({
    uf: "MG",
    cnes: "1111111",
    cnesNomeEstabelecimento: "Hospital A",
    municipio: "Belo Horizonte",
    ...extra,
  }) as unknown as ConvenioUnificado;

function usar(
  filtros: Record<string, unknown>,
  convenios: ConvenioUnificado[] = [],
  situacao: Parameters<typeof useRelatorioEscopo>[2] = null,
) {
  return renderHook(() =>
    useRelatorioEscopo(
      { ...filtrosVazios, ...filtros } as Filtros,
      convenios,
      situacao,
    ),
  ).result.current;
}

describe("useRelatorioEscopo", () => {
  it("sem filtros usa o escopo Brasil", () => {
    const r = usar({});
    expect(r.resumoEscopo).toBe("Brasil");
    expect(r.filtroGeracao).toMatchObject({
      escopo: "brasil",
      uf: undefined,
      municipio: undefined,
      cnes: undefined,
      encerramento: "todos",
    });
    expect(r.municipioAmbiguo).toBe(false);
    expect(r.estabelecimentoAmbiguo).toBe(false);
  });

  it("UF isolada vira escopo uf com o nome do estado", () => {
    const r = usar({ uf: "MG" });
    expect(r.filtroGeracao).toMatchObject({ escopo: "uf", uf: "MG" });
    expect(r.resumoEscopo).toBe("Minas Gerais");
  });

  it("UF desconhecida cai no próprio código", () => {
    expect(usar({ uf: "ZZ" }).resumoEscopo).toBe("ZZ");
  });

  it("município sem UF deriva a UF do próprio item", () => {
    const r = usar({ municipio: "belo horizonte" }, [convenio({})]);
    expect(r.filtroGeracao).toMatchObject({
      escopo: "municipio",
      uf: "MG",
      municipio: "belo horizonte",
    });
    expect(r.resumoEscopo).toBe("Belo Horizonte / MG");
  });

  it("município sem nenhum item cai em Brasil", () => {
    const r = usar({ municipio: "inexistente" }, [convenio({})]);
    expect(r.filtroGeracao.escopo).toBe("brasil");
  });

  it("município presente em duas UFs sem UF escolhida é ambíguo", () => {
    const r = usar({ municipio: "belo horizonte" }, [
      convenio({}),
      convenio({ uf: "SP" }),
    ]);
    expect(r.municipioAmbiguo).toBe(true);
  });

  it("município em duas UFs com UF escolhida não é ambíguo", () => {
    const r = usar({ municipio: "belo horizonte", uf: "SP" }, [
      convenio({}),
      convenio({ uf: "SP" }),
    ]);
    expect(r.municipioAmbiguo).toBe(false);
    expect(r.filtroGeracao).toMatchObject({ escopo: "municipio", uf: "SP" });
  });

  it("CNES escolhido vence UF e município", () => {
    const r = usar({ cnes: "2222222", uf: "MG", municipio: "belo horizonte" }, [
      convenio({}),
    ]);
    expect(r.filtroGeracao).toMatchObject({
      escopo: "cnes",
      cnes: "2222222",
      uf: undefined,
      municipio: undefined,
    });
    expect(r.resumoEscopo).toBe("CNES 2222222");
  });

  it("estabelecimento resolve o CNES correspondente", () => {
    const r = usar({ nomeEstabelecimento: "hospital a" }, [
      convenio({}),
      convenio({ cnes: "1111111" }),
    ]);
    expect(r.filtroGeracao).toMatchObject({ escopo: "cnes", cnes: "1111111" });
    expect(r.estabelecimentoAmbiguo).toBe(false);
  });

  it("estabelecimento com CNES diferentes é ambíguo", () => {
    const r = usar({ nomeEstabelecimento: "hospital a" }, [
      convenio({}),
      convenio({ cnes: "3333333" }),
    ]);
    expect(r.estabelecimentoAmbiguo).toBe(true);
  });

  it("estabelecimento sem nome no convênio não casa", () => {
    const r = usar({ nomeEstabelecimento: "hospital a" }, [
      convenio({ cnesNomeEstabelecimento: null, cnes: null }),
    ]);
    expect(r.filtroGeracao.escopo).toBe("brasil");
  });

  it("converte anos, programa, tipo, equipamento e situação", () => {
    const r = usar(
      {
        anoInicio: "2020",
        anoFim: "2024",
        programa: "PRONON",
        tipoContratacao: "FAF",
        equipamento: "Mamógrafo",
      },
      [],
      { valor: "Concluído", origem: "instrumento" },
    );
    expect(r.filtroGeracao).toMatchObject({
      anoInicio: 2020,
      anoFim: 2024,
      programa: "PRONON",
      tipoContratacao: "FAF",
      equipamento: "Mamógrafo",
      situacao: "Concluído",
      situacaoOrigem: "instrumento",
    });
  });
});
