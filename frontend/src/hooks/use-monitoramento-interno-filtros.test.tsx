import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { criarMarcadorTeste } from "@/test-fixtures/dados-oficiais";
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
  it("deduplica aliases prioritários, ignora instrumentos fora da carteira e não usa tags ou prosa", () => {
    // Given
    const itens = [
      {
        ...instrumentos[0]!,
        equipamento_descricao: "Mamógrafo e curso de braquiterapia",
      },
    ];
    const fontes = [
      {
        numero: itens[0]!.nr_convenio,
        equipamentos: [
          criarMarcadorTeste("LINAC", false),
          criarMarcadorTeste("Acelerador Linear", true),
          criarMarcadorTeste("Braquiterapia", true),
        ],
      },
      {
        numero: "FORA-DA-CARTEIRA",
        equipamentos: [criarMarcadorTeste("Mamógrafo", true)],
      },
    ];
    const original = structuredClone(fontes);
    const { result } = renderHook(
      () => useMonitoramentoInternoFiltros(itens, fontes),
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
    );
    // When / Then
    expect(result.current.equipamentoOptions).toEqual([
      { value: "Acelerador Linear", label: "Acelerador Linear" },
      { value: "Braquiterapia", label: "Braquiterapia" },
    ]);
    act(() => result.current.setEquipamento("Braquiterapia"));
    expect(result.current.filtrados).toHaveLength(1);
    act(() => result.current.setClasseEquipamento("outro"));
    expect(result.current.equipamentoOptions).toEqual([]);
    expect(fontes).toEqual(original);
  });

  it("não inventa marcador a partir da descrição quando a fonte está ausente", () => {
    // Given / When
    const { result } = renderHook(
      () =>
        useMonitoramentoInternoFiltros([
          {
            ...instrumentos[0]!,
            equipamento_descricao: "0123 - Acelerador Linear e Braquiterapia",
          },
        ]),
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
    );
    // Then
    expect(result.current.equipamentoOptions).toEqual([]);
    act(() => result.current.setEquipamento("Acelerador Linear"));
    expect(result.current.filtrados).toHaveLength(0);
  });

  it("resume nomes extensos só na apresentação e aceita link antigo com código", () => {
    // Given
    const nome = "0123 - Cadeira hospitalar " + "especial ".repeat(12);
    const fontes = [
      {
        numero: instrumentos[0]!.nr_convenio,
        equipamentos: [criarMarcadorTeste(nome)],
      },
    ];
    const { result } = renderHook(
      () => useMonitoramentoInternoFiltros(instrumentos, fontes),
      {
        wrapper: ({ children }) => (
          <MemoryRouter
            initialEntries={[`/?equipamento=${encodeURIComponent(nome)}`]}
          >
            {children}
          </MemoryRouter>
        ),
      },
    );
    // When / Then
    expect(result.current.equipamentoOptions[0]!.label).toMatch(
      /^Cadeira hospitalar.*…$/,
    );
    expect(result.current.equipamentoOptions[0]!.label).not.toContain("0123");
    expect(result.current.equipamentoOptions[0]!.value).not.toContain("…");
    expect(result.current.filtrados.map((item) => item.nr_convenio)).toEqual([
      instrumentos[0]!.nr_convenio,
    ]);
  });

  it("usa marcadores separados, não a descrição composta, e filtra qualquer equipamento do instrumento", () => {
    // Given: prosa com códigos não é a identidade de filtro.
    const itens = [
      {
        ...instrumentos[0]!,
        equipamento_descricao: "0123 - Mamógrafo, 0456 - Cadeira hospitalar",
      },
    ];
    const fontes = [
      {
        numero: itens[0]!.nr_convenio,
        equipamentos: [
          criarMarcadorTeste("Mamógrafo", true),
          criarMarcadorTeste("0456 - Cadeira hospitalar"),
        ],
      },
    ];
    const { result } = renderHook(
      () => useMonitoramentoInternoFiltros(itens, fontes),
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> },
    );
    // When / Then
    expect(result.current.equipamentoOptions).toEqual([
      { value: "cadeira hospitalar", label: "Cadeira hospitalar" },
      { value: "Mamógrafo", label: "Mamógrafo" },
    ]);
    act(() => result.current.setEquipamento("cadeira hospitalar"));
    expect(result.current.filtrados).toHaveLength(1);
    act(() => result.current.setClasseEquipamento("outro"));
    expect(result.current.equipamentoOptions).toEqual([
      { value: "cadeira hospitalar", label: "Cadeira hospitalar" },
    ]);
  });

  it.each(["anapolis", "ANÁPOLIS", " Anápolis "])(
    "padroniza municípios e aceita a URL histórica %s",
    (municipio) => {
      // Given: variantes de caixa, acento e espaçamento em dados sintéticos.
      const itens = ["ANAPOLIS", "anápolis", "Anápolis", "   "].map(
        (nome, indice) => ({
          ...instrumentos[0]!,
          nr_convenio: `QA-MUNICIPIO-${indice}`,
          municipio: nome,
        }),
      );
      // When
      const { result } = renderHook(
        () => useMonitoramentoInternoFiltros(itens),
        {
          wrapper: ({ children }) => (
            <MemoryRouter
              initialEntries={[`/?municipio=${encodeURIComponent(municipio)}`]}
            >
              {children}
            </MemoryRouter>
          ),
        },
      );
      // Then
      expect(result.current.municipioOptions).toEqual([
        { value: "anapolis", label: "Anápolis" },
      ]);
      expect(result.current.municipio).toBe("anapolis");
      expect(result.current.filtrados).toHaveLength(3);
      expect(itens[1]!.municipio).toBe("anápolis");
    },
  );

  const carteira: InstrumentoMonitoramentoFiltravel[] = [
    {
      ...instrumentos[0]!,
      equipamento_descricao: "Mamógrafo",
      programa: "Oncologia",
      ano_instrumento: 2025,
    },
    {
      ...instrumentos[1]!,
      equipamento_descricao: "Cadeira hospitalar",
      programa: "Hospital",
      ano_instrumento: 2026,
    },
    {
      ...instrumentos[0]!,
      nr_convenio: "999003",
      cnes: null,
      municipio: null,
      uf: null,
      tipo_contratacao: null,
      fase_atual: null,
      equipamento_descricao: null,
      programa: null,
      ano_instrumento: null,
    },
  ];
  function montar(query = "") {
    const fontes = [
      {
        numero: carteira[0]!.nr_convenio,
        equipamentos: [criarMarcadorTeste("Mamógrafo", true)],
      },
      {
        numero: carteira[1]!.nr_convenio,
        equipamentos: [criarMarcadorTeste("Cadeira hospitalar")],
      },
    ];
    return renderHook(() => useMonitoramentoInternoFiltros(carteira, fontes), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[`/?${query}`]}>{children}</MemoryRouter>
      ),
    });
  }

  it.each([
    ["cnes=1234567", "25000198305202459"],
    ["uf=DF", "953749"],
    ["municipio=maceio", "25000198305202459"],
    ["equipamento=Mamógrafo", "25000198305202459"],
    ["equipamento=nao%20informado", "999003"],
    ["situacao=Não%20iniciado", "999003"],
    ["programa=Não%20informado", "999003"],
    ["programa=Oncologia", "25000198305202459"],
    ["ano_inicio=2026", "953749"],
    ["ano_fim=2025", "25000198305202459"],
    ["ano_inicio=2025&ano_fim=2025", "25000198305202459"],
  ])(
    "restaura o recorte %s da URL sem incluir registros incompatíveis",
    (query, numero) => {
      const { result } = montar(query);
      expect(result.current.filtrados.map((item) => item.nr_convenio)).toEqual([
        numero,
      ]);
    },
  );

  it.each(["0", "-1", "2.5", "invalida"])(
    "descarta página inválida %s",
    (pagina) => {
      expect(montar(`pagina=${pagina}`).result.current.pagina).toBe(1);
    },
  );

  it("mantém as opções por classe e limpa equipamento ao trocar a classe", () => {
    const { result } = montar("pagina=3&equipamento=Mamógrafo");
    act(() => result.current.setClasseEquipamento("outro"));
    expect(result.current.equipamento).toBeNull();
    expect(result.current.pagina).toBe(1);
    expect(result.current.equipamentoOptions).toEqual([
      { value: "cadeira hospitalar", label: "Cadeira hospitalar" },
    ]);
    act(() => result.current.setClasseEquipamento("prioritario"));
    expect(result.current.equipamentoOptions).toEqual([
      { value: "Mamógrafo", label: "Mamógrafo" },
    ]);
    act(() => result.current.setClasseEquipamento("todos"));
    expect(result.current.equipamentoOptions).toHaveLength(2);
  });

  it("atualiza cada seletor na URL e reinicia a página", () => {
    const { result } = montar();
    const filtros = [
      ["setCnes", "1234567"],
      ["setUf", "AL"],
      ["setMunicipio", "maceio"],
      ["setEquipamento", "Mamógrafo"],
      ["setSituacao", "Em instalação"],
      ["setPrograma", "Oncologia"],
      ["setAnoInicio", "2026"],
      ["setAnoFim", "2025"],
    ] as const;
    for (const [setter, valor] of filtros) {
      act(() => result.current.setPagina(3));
      expect(result.current.pagina).toBe(3);
      act(() => result.current[setter](valor));
      expect(result.current.pagina).toBe(1);
      expect(result.current.filtrados).toHaveLength(1);
      act(() => result.current[setter](null));
    }
    act(() => result.current.setPagina(1));
    expect(result.current.pagina).toBe(1);
    expect(result.current.anoOptions).toEqual([
      { value: "2026", label: "2026" },
      { value: "2025", label: "2025" },
    ]);
  });

  it("combina busca livre com os seletores e limpa ambos", () => {
    const { result } = renderHook(
      () => useMonitoramentoInternoFiltros(instrumentos),
      { wrapper: MemoryRouter },
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
