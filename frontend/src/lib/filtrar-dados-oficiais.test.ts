import { describe, expect, it } from "vitest";
import type { ConvenioUnificado } from "@/types/monitoramento";
import { filtrarDadosOficiais } from "./filtrar-dados-oficiais";

const CONVENIO_COM_CNES: ConvenioUnificado = {
  numero: "953749",
  numeroInstrumento: null,
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
  it("encontra instrumento pelo CNES", () => {
    const resultado = filtrarDadosOficiais(
      [CONVENIO_COM_CNES],
      {
        busca: "1234567",
        uf: null,
        equipamento: null,
        situacao: null,
        ano: null,
        programa: null,
        tipoContratacao: null,
        soMonitorados: false,
      },
      new Set(),
      (item) => item.situacao,
    );

    expect(resultado).toEqual([CONVENIO_COM_CNES]);
  });
});
