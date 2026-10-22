import { describe, expect, it } from "vitest";
import type { ConvenioUnificado } from "@/types/monitoramento";
import { filtrarDadosOficiais } from "./filtrar-dados-oficiais";
import { criarConvenioTeste } from "@/test-fixtures/dados-oficiais";

const CONVENIO_COM_CNES: ConvenioUnificado = {
  numero: "953749",
  numeroInstrumento: null,
  anoInstrumento: 2025,
  objeto: "Aquisição de tomógrafo",
  situacao: "Em execução",
  situacaoPortal: "",
  situacaoContratacao: null,
  tipoContratacao: "Convênio",
  tipologia: null,
  convenente: { nome: "Hospital de teste", cnpj: null, tipo: "" },
  municipio: "Brasília",
  uf: "DF",
  codigoIbge: "",
  regiao: "",
  orgao: "",
  unidadeGestora: "",
  subfuncao: "",
  funcao: "",
  tipoInstrumento: "",
  numeroProcesso: "",
  cnes: "1234567",
  cnesNomeEstabelecimento: "Hospital de teste",
  programa: null,
  equipamentos: [],
  dadosOficiaisDisponiveis: true,
  desembolsoIntegralDaCarga: false,
  valorPagoFornecedor: null,
  pagamentosCount: 0,
  datas: {
    publicacao: null,
    inicioVigencia: null,
    fimVigencia: null,
    conclusao: null,
    ultimaLiberacao: null,
  },
  financeiro: {
    global: null,
    repasse: null,
    empenhado: null,
    desembolsado: null,
    contrapartida: null,
    saldoConta: null,
    ultimaLiberacaoValor: null,
    fonteConfiavel: true,
  },
  siconv: null,
  transferegov: null,
};

describe("filtrarDadosOficiais", () => {
  const estadoVazio: Parameters<typeof filtrarDadosOficiais>[1] = {
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

  const carteira = [
    criarConvenioTeste({ numero: "000001", uf: "BA", situacao: "Concluído" }),
    criarConvenioTeste({
      numero: "25000123456202601",
      uf: "DF",
      tipoContratacao: "TED",
    }),
    criarConvenioTeste({ numero: "000003", uf: "BA" }),
    criarConvenioTeste({ numero: "000004", uf: "SP" }),
  ];
  const monitorados = new Set(["000001", "25000123456202601"]);

  it.each([
    [null, ["000001", "25000123456202601", "000003", "000004"]],
    ["sim", ["000001", "25000123456202601"]],
    ["nao", ["000003", "000004"]],
  ] as const)(
    "Monitorado=%s usa vínculo exato, inclusive concluídos e cargas manuais",
    (monitorado, esperado) => {
      const originais = structuredClone(carteira);
      const resultado = filtrarDadosOficiais(
        carteira,
        { ...estadoVazio, monitorado },
        monitorados,
        (item) => item.situacao,
      );
      expect(resultado.map((item) => item.numero)).toEqual(esperado);
      expect(carteira).toEqual(originais);
    },
  );

  it.each(["sim", "nao"] as const)(
    "combina Monitorado=%s com UF e busca sem acentos",
    (monitorado) => {
      const resultado = filtrarDadosOficiais(
        carteira,
        { ...estadoVazio, monitorado, uf: "BA", busca: "aquisicao" },
        monitorados,
        (item) => item.situacao,
      );
      expect(resultado.map((item) => item.numero)).toEqual(
        monitorado === "sim" ? ["000001"] : ["000003"],
      );
    },
  );

  it("conjunto vazio confirmado não inventa vínculo ou remove os não monitorados", () => {
    expect(
      filtrarDadosOficiais(
        carteira,
        { ...estadoVazio, monitorado: "sim" },
        new Set(),
        (item) => item.situacao,
      ),
    ).toEqual([]);
    expect(
      filtrarDadosOficiais(
        carteira,
        { ...estadoVazio, monitorado: "nao" },
        new Set(),
        (item) => item.situacao,
      ),
    ).toEqual(carteira);
    expect(
      filtrarDadosOficiais(
        [],
        estadoVazio,
        monitorados,
        (item) => item.situacao,
      ),
    ).toEqual([]);
  });

  it("encontra por texto livre sem acento e combina com o tipo", () => {
    const filtros = {
      busca: "  brasilia ",
      uf: null,
      municipio: null,
      cnes: null,
      equipamento: null,
      situacao: null,
      anoInicio: null,
      anoFim: null,
      programa: null,
      tipoContratacao: "Convênio",
      monitorado: null,
    };
    expect(
      filtrarDadosOficiais(
        [CONVENIO_COM_CNES],
        filtros,
        new Set(),
        (item) => item.situacao,
      ),
    ).toEqual([CONVENIO_COM_CNES]);
    expect(
      filtrarDadosOficiais(
        [CONVENIO_COM_CNES],
        { ...filtros, busca: "não encontrado" },
        new Set(),
        (item) => item.situacao,
      ),
    ).toEqual([]);
  });

  it("filtra instrumento pelo CNES", () => {
    const resultado = filtrarDadosOficiais(
      [CONVENIO_COM_CNES],
      {
        uf: null,
        municipio: null,
        cnes: "1234567",
        equipamento: null,
        situacao: null,
        anoInicio: null,
        anoFim: null,
        programa: null,
        tipoContratacao: null,
        monitorado: null,
      },
      new Set(),
      (item) => item.situacao,
    );

    expect(resultado).toEqual([CONVENIO_COM_CNES]);
  });
});
