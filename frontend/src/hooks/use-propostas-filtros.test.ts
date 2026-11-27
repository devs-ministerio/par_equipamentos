import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePropostasFiltros } from "@/hooks/use-propostas-filtros";

type Args = Parameters<typeof usePropostasFiltros>;

const proposta = (extra: Record<string, unknown>) =>
  ({
    id: 1,
    cd_parceria: null,
    id_proposta: 100,
    nm_proponente: "Hospital A",
    cnpj_ente_recebedor: "00",
    cnes: "1111111",
    cnes_nome_estabelecimento: "Hospital A",
    municipio: "Belo Horizonte",
    uf: "MG",
    ds_objeto: "Aquisição de mamógrafo",
    nm_programa: "PRONON",
    id_programa: 10,
    data_proposta: "2024-05-10",
    situacao_proposta: "Em Análise",
    tem_parceria: false,
    tipo_contratacao: "PRONON",
    metas_resumo: null,
    equipamentos: [{ nome: "Mamógrafo" }],
    ...extra,
  }) as unknown as Args[0][number];

const manual = (extra: Record<string, unknown>) =>
  ({
    nr_convenio: "25000198305202459",
    nome_convenente: "Fundação B",
    cnes: "2222222",
    municipio: "Recife",
    uf: "PE",
    tipo_contratacao: "FAF",
    ...extra,
  }) as unknown as Args[1][number];

const PROPOSTAS = [
  proposta({}),
  proposta({
    id: 2,
    id_proposta: 200,
    nm_proponente: "Santa Casa",
    cnes: "3333333",
    municipio: "São Paulo",
    uf: "SP",
    id_programa: 20,
    nm_programa: "FAF",
    data_proposta: "2022-01-02",
    situacao_proposta: "Rejeitada",
    tem_parceria: true,
    tipo_contratacao: "FAF",
    equipamentos: [{ nome: "Acelerador Linear" }],
  }),
  proposta({
    id: 3,
    id_proposta: 300,
    data_proposta: null,
    situacao_proposta: "Aprovada",
    equipamentos: [{ nome: "Mamógrafo" }, { nome: "Mamógrafo" }],
    metas_resumo: {
      parceria: { in_situacao_parceria: "Ativa" },
      timeline_financeira: {
        empenhos: [{ in_situacao_siafi: "Empenhada" }],
      },
    },
  }),
];
const MANUAIS = [
  manual({}),
  manual({ nr_convenio: "2", tipo_contratacao: "TED", uf: "RJ" }),
];

function usar() {
  return renderHook(() => usePropostasFiltros(PROPOSTAS, MANUAIS));
}

describe("usePropostasFiltros", () => {
  it("sem filtros devolve tudo, sem hasFiltros", () => {
    const { result } = usar();
    expect(result.current.filtradas).toHaveLength(3);
    expect(result.current.manuaisFiltrados).toHaveLength(2);
    expect(result.current.total).toBe(5);
    expect(result.current.hasFiltros).toBe(false);
  });

  it("monta opções de UF, CNES, município, equipamento, situação, programa e ano", () => {
    const { opcoes } = usar().result.current;
    expect(opcoes.uf.map((o) => o.value)).toEqual(["MG", "PE", "RJ", "SP"]);
    expect(opcoes.cnes.map((o) => o.value)).toContain("3333333");
    expect(opcoes.municipio.map((o) => o.value)).toContain("Recife");
    expect(opcoes.equipamento[0]).toEqual({
      value: "Mamógrafo",
      label: "Mamógrafo (2)",
    });
    expect(opcoes.situacao.map((o) => o.value)).toContain("Empenhada");
    expect(opcoes.programa.map((o) => o.value)).toEqual(["10", "20"]);
    expect(opcoes.ano.map((o) => o.value)).toEqual(["2024", "2022"]);
  });

  it("lista os tipos de contratação com contagem", () => {
    const { tipos } = usar().result.current;
    expect(tipos).toEqual([
      { valor: "FAF", total: 2 },
      { valor: "PRONON", total: 2 },
      { valor: "TED", total: 1 },
    ]);
  });

  it("busca livre ignora acento e caixa", () => {
    const { result } = usar();
    act(() => result.current.setBusca("santa casa"));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([2]);
    act(() => result.current.setBusca("fundacao"));
    expect(result.current.filtradas).toHaveLength(0);
    expect(result.current.manuaisFiltrados).toHaveLength(2);
    expect(result.current.hasFiltros).toBe(true);
  });

  it("filtra por UF, CNES e município nas duas listas", () => {
    const { result } = usar();
    act(() => result.current.setUf(["MG"]));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([1, 3]);
    expect(result.current.manuaisFiltrados).toHaveLength(0);
    act(() => result.current.setUf([]));
    act(() => result.current.setCnes(["2222222"]));
    expect(result.current.filtradas).toHaveLength(0);
    expect(result.current.manuaisFiltrados).toHaveLength(2);
    act(() => result.current.setCnes([]));
    act(() => result.current.setMunicipio(["Recife"]));
    expect(result.current.filtradas).toHaveLength(0);
    expect(result.current.manuaisFiltrados).toHaveLength(2);
  });

  it("filtros de dado da proposta deixam os manuais de fora", () => {
    const { result } = usar();
    act(() => result.current.setEquipamento(["Acelerador Linear"]));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([2]);
    expect(result.current.manuaisFiltrados).toHaveLength(0);
    act(() => result.current.setEquipamento([]));
    act(() => result.current.setSituacao(["Empenhada"]));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([3]);
    act(() => result.current.setSituacao([]));
    act(() => result.current.setPrograma(["20"]));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([2]);
  });

  it.each([
    [
      "ano inicial",
      (r: ReturnType<typeof usar>["result"]) => r.current.setAnoInicio("2020"),
    ],
    [
      "ano final",
      (r: ReturnType<typeof usar>["result"]) => r.current.setAnoFim("2030"),
    ],
    [
      "programa",
      (r: ReturnType<typeof usar>["result"]) => r.current.setPrograma(["20"]),
    ],
    [
      "situação",
      (r: ReturnType<typeof usar>["result"]) =>
        r.current.setSituacao(["Empenhada"]),
    ],
    [
      "estágio de proposta",
      (r: ReturnType<typeof usar>["result"]) =>
        r.current.setEstagio(["tramitacao"]),
    ],
  ])("%s sozinho deixa os manuais de fora", (_nome, aplicar) => {
    const { result } = usar();
    expect(result.current.manuaisFiltrados).toHaveLength(2);
    act(() => aplicar(result));
    expect(result.current.manuaisFiltrados).toHaveLength(0);
  });

  it("proposta sem UF, CNES, município ou situação não passa pelos filtros dessas colunas", () => {
    const vazia = proposta({
      id: 9,
      uf: null,
      cnes: null,
      municipio: null,
      situacao_proposta: null,
    });
    const { result } = renderHook(() => usePropostasFiltros([vazia], []));
    expect(result.current.filtradas).toHaveLength(1);
    act(() => result.current.setUf(["MG"]));
    expect(result.current.filtradas).toHaveLength(0);
    act(() => result.current.setUf([]));
    act(() => result.current.setCnes(["1111111"]));
    expect(result.current.filtradas).toHaveLength(0);
    act(() => result.current.setCnes([]));
    act(() => result.current.setMunicipio(["Belo Horizonte"]));
    expect(result.current.filtradas).toHaveLength(0);
    act(() => result.current.setMunicipio([]));
    act(() => result.current.setSituacao(["Aprovada"]));
    expect(result.current.filtradas).toHaveLength(0);
  });

  it("filtra por período e exclui proposta sem data", () => {
    const { result } = usar();
    act(() => result.current.setAnoInicio("2023"));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([1]);
    act(() => result.current.setAnoInicio(null));
    act(() => result.current.setAnoFim("2022"));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([2]);
  });

  it("filtra por estágio e por tipo", () => {
    const { result } = usar();
    act(() => result.current.setEstagio(["confirmada"]));
    expect(result.current.filtradas.map((p) => p.id)).toEqual([2]);
    expect(result.current.manuaisFiltrados).toHaveLength(2);
    act(() => result.current.setEstagio(["tramitacao"]));
    expect(result.current.manuaisFiltrados).toHaveLength(0);
    act(() => result.current.setEstagio([]));
    act(() => result.current.setTipo("TED"));
    expect(result.current.filtradas).toHaveLength(0);
    expect(result.current.manuaisFiltrados.map((i) => i.nr_convenio)).toEqual([
      "2",
    ]);
  });

  it("agrupa por situação de fato na ordem do funil", () => {
    const { gruposPorSituacao } = usar().result.current;
    expect(gruposPorSituacao.map((g) => g.sit)).toEqual([
      "Empenhada",
      "Em Análise",
      "Rejeitada",
    ]);
  });

  it("proposta sem situação cai em 'Sem situação informada'", () => {
    const { result } = renderHook(() =>
      usePropostasFiltros([proposta({ situacao_proposta: null })], []),
    );
    expect(result.current.gruposPorSituacao[0].sit).toBe(
      "Sem situação informada",
    );
  });

  it("limparFiltros zera tudo", () => {
    const { result } = usar();
    act(() => {
      result.current.setBusca("x");
      result.current.setUf(["MG"]);
      result.current.setTipo("TED");
    });
    expect(result.current.hasFiltros).toBe(true);
    act(() => result.current.limparFiltros());
    expect(result.current.hasFiltros).toBe(false);
    expect(result.current.filtradas).toHaveLength(3);
  });
});
