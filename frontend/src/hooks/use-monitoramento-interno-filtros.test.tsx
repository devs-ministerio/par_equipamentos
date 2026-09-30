import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  useMonitoramentoInternoFiltros,
  type InstrumentoMonitoramentoFiltravel,
} from "./use-monitoramento-interno-filtros";

const instrumentos: InstrumentoMonitoramentoFiltravel[] = [
  {
    nr_convenio: "25000198305202459",
    cnes: "1234567",
    nome_convenente: "Hospital São Lucas",
    municipio: "Maceió",
    uf: "AL",
    tipo_contratacao: "TED",
    fase_atual: "Em instalação",
    situacao_prestacao_contas: null,
    tecnico_titular: "Ana Silva",
  },
  {
    nr_convenio: "953749",
    cnes: "7654321",
    nome_convenente: "Hospital de Brasília",
    municipio: "Brasília",
    uf: "DF",
    tipo_contratacao: "Convênio",
    fase_atual: "Concluído",
    situacao_prestacao_contas: "Prestação de Contas Concluída",
    tecnico_titular: null,
  },
];

describe("useMonitoramentoInternoFiltros", () => {
  it("combina busca livre com os seletores e limpa ambos", () => {
    const { result } = renderHook(() =>
      useMonitoramentoInternoFiltros(instrumentos),
    );

    act(() => result.current.setBusca("sao lucas"));
    expect(result.current.filtrados.map((item) => item.nr_convenio)).toEqual([
      "25000198305202459",
    ]);
    expect(result.current.hasFiltros).toBe(true);

    act(() => result.current.setTipoContratacao("Convênio"));
    expect(result.current.filtrados).toEqual([]);

    act(() => result.current.limparFiltros());
    expect(result.current.busca).toBe("");
    expect(result.current.filtrados).toHaveLength(2);
    expect(result.current.hasFiltros).toBe(false);
  });
});
