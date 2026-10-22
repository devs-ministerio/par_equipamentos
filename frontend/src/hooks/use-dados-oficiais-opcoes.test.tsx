import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { filtrarDadosOficiais } from "@/lib/filtrar-dados-oficiais";
import {
  criarCarteiraOpcoes,
  criarConvenioTeste,
} from "@/test-fixtures/dados-oficiais";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { ClasseEquipamento } from "@/types/dados-oficiais";
import { useDadosOficiaisOpcoes } from "./use-dados-oficiais-opcoes";

type Estado = Parameters<typeof filtrarDadosOficiais>[1];
const vazio: Estado = {
  uf: null,
  municipio: null,
  cnes: null,
  equipamento: null,
  situacao: null,
  anoInicio: null,
  anoFim: null,
  programa: null,
  tipoContratacao: null,
  monitorado: null,
};
const situacaoExibida = (item: ConvenioUnificado) => item.situacao || null;

function montar(
  itens = criarCarteiraOpcoes(),
  estado: Estado = vazio,
  classeEquipamento: ClasseEquipamento = "prioritario",
) {
  return renderHook(
    ({ itens, estado, classeEquipamento }) =>
      useDadosOficiaisOpcoes({
        classeEquipamento,
        situacaoExibida,
        filtrar: (ignorar) =>
          filtrarDadosOficiais(
            itens,
            estado,
            new Set(),
            situacaoExibida,
            ignorar,
          ),
      }),
    { initialProps: { itens, estado, classeEquipamento } },
  );
}

const opcoesEsperadas = {
  ufs: [
    { value: "BA", label: "BA" },
    { value: "SP", label: "SP" },
  ],
  municipioOptions: [
    { value: "salvador", label: "Salvador (2)" },
    { value: "campinas", label: "Campinas (1)" },
  ],
  cnesOptions: [
    { value: "0000001", label: "0000001 (1)" },
    { value: "0000002", label: "0000002 (1)" },
  ],
  equipamentoOptions: [
    { value: "Acelerador Linear", label: "Acelerador Linear (2)" },
    { value: "Mamógrafo", label: "Mamógrafo (1)" },
  ],
  anoOptions: [
    { value: "2026", label: "2026" },
    { value: "2024", label: "2024" },
  ],
  situacaoOptions: [
    { value: "Em execução", label: "Em execução (1)" },
    {
      value: "Prestação de Contas Concluída",
      label: "Prestação de Contas Concluída (1)",
    },
  ],
  tipoContratacaoOptions: [
    { value: "Convênio", label: "Convênio (2)" },
    { value: "TED", label: "TED (1)" },
  ],
  programaOptions: [
    { value: "Programa Alfa", label: "Programa Alfa (1)" },
    { value: "Programa Beta", label: "Programa Beta (1)" },
  ],
};

describe("opções em cascata com o filtro de domínio real", () => {
  it("agrupa grafias municipais e seleciona todas as variantes sem alterar a fonte", () => {
    // Given: grafias recebidas de fontes diferentes, inclusive sem acento.
    const itens = ["Anápolis", "ANÁPOLIS", " anapolis ", "", "   "].map(
      (municipio, indice) =>
        criarConvenioTeste({
          numero: `QA-MUNICIPIO-${indice}`,
          municipio,
          uf: "GO",
        }),
    );
    const originais = structuredClone(itens);
    const { result } = montar(itens);
    // When / Then: rótulo estável, uma opção e contagem agrupada.
    expect(result.current.municipioOptions).toEqual([
      { value: "anapolis", label: "Anápolis (3)" },
    ]);
    for (const municipio of ["anapolis", "ANÁPOLIS", " Anápolis "]) {
      expect(
        filtrarDadosOficiais(
          itens,
          { ...vazio, municipio },
          new Set(),
          situacaoExibida,
        ).map((item) => item.numero),
      ).toEqual(itens.slice(0, 3).map((item) => item.numero));
    }
    expect(
      montar([...itens].reverse()).result.current.municipioOptions,
    ).toEqual(result.current.municipioOptions);
    expect(itens).toEqual(originais);
  });

  it("conta por instrumento, deduplica aliases e não transforma ausência em opção", () => {
    // Arrange / Act
    const { result } = montar();
    // Assert
    expect(result.current).toEqual(opcoesEsperadas);
  });

  const dimensoes = [
    ["uf", "BA", "ufs"],
    ["municipio", "SALVADOR", "municipioOptions"],
    ["cnes", "0000001", "cnesOptions"],
    ["equipamento", "Mamógrafo", "equipamentoOptions"],
    ["situacao", "Em execução", "situacaoOptions"],
    ["anoInicio", "2026", "anoOptions"],
    ["programa", "Programa Beta", "programaOptions"],
    ["tipoContratacao", "TED", "tipoContratacaoOptions"],
  ] as const;
  it.each(dimensoes)(
    "selecionar %s mantém seu próprio seletor reversível",
    (campo, valor, opcoes) => {
      // Arrange / Act
      const { result } = montar(criarCarteiraOpcoes(), {
        ...vazio,
        [campo]: valor,
      });
      // Assert
      expect(result.current[opcoes]).toEqual(opcoesEsperadas[opcoes]);
    },
  );

  it("restringe os outros seletores e recalcula quando o recorte muda", () => {
    // Arrange
    const itens = criarCarteiraOpcoes();
    const { result, rerender } = montar(itens, { ...vazio, uf: "SP" });
    expect(result.current.equipamentoOptions).toEqual([
      { value: "Mamógrafo", label: "Mamógrafo (1)" },
    ]);
    expect(result.current.municipioOptions).toEqual([
      { value: "campinas", label: "Campinas (1)" },
    ]);
    // Act
    rerender({
      itens,
      estado: { ...vazio, uf: "BA" },
      classeEquipamento: "prioritario",
    });
    // Assert
    expect(result.current.equipamentoOptions).toEqual([
      { value: "Acelerador Linear", label: "Acelerador Linear (2)" },
    ]);
    expect(result.current.municipioOptions).toEqual([
      { value: "salvador", label: "Salvador (2)" },
    ]);
  });

  it("preserva os outros equipamentos de um instrumento misto sem listar alias prioritário em Outros", () => {
    // Arrange
    const itens = criarCarteiraOpcoes();
    const { result, rerender } = montar(itens);
    // Act
    rerender({ itens, estado: vazio, classeEquipamento: "outro" });
    // Assert
    expect(result.current.equipamentoOptions).toEqual([
      { value: "123 - Cadeira hospitalar", label: "Cadeira hospitalar (1)" },
    ]);
  });

  it("resume descrições longas apenas no rótulo e mantém o valor completo", () => {
    // Arrange
    const itens = criarCarteiraOpcoes();
    const nome = "123 - " + "Cadeira hospitalar ".repeat(6);
    itens[0].equipamentos[2].nome = nome;
    const { result } = montar(itens, vazio, "outro");
    // Act / Assert
    expect(result.current.equipamentoOptions).toEqual([
      {
        value: nome,
        label: "Cadeira hospitalar Cadeira hospitalar Cadeira hos… (1)",
      },
    ]);
  });

  it("empates de frequência têm ordem alfabética pt-BR e dados vazios não criam opções", () => {
    // Arrange
    const itens = [
      criarConvenioTeste({ municipio: "Zulu" }),
      criarConvenioTeste({ numero: "QA002", municipio: "Água" }),
    ];
    const { result, rerender } = montar(itens);
    // Act / Assert
    expect(result.current.municipioOptions).toEqual([
      { value: "agua", label: "Água (1)" },
      { value: "zulu", label: "Zulu (1)" },
    ]);
    rerender({ itens: [], estado: vazio, classeEquipamento: "prioritario" });
    expect(
      Object.values(result.current).every((opcoes) => opcoes.length === 0),
    ).toBe(true);
  });
});
