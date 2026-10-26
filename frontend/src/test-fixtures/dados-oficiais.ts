import type {
  ConvenioUnificado,
  EquipamentoMarcador,
} from "@/types/monitoramento";

export function criarMarcadorTeste(
  nome: string,
  prioritario = false,
): EquipamentoMarcador {
  return {
    codigo: nome,
    nome,
    prioritario,
    descricaoOriginal: nome,
    tipoEvidencia: "item_plano",
    relacao: "aquisicao",
    confianca: 1,
  };
}

export function criarConvenioTeste(
  extra: Partial<ConvenioUnificado> = {},
): ConvenioUnificado {
  return {
    numero: "QA001",
    numeroInstrumento: null,
    anoInstrumento: 2024,
    objeto: "Aquisição sintética",
    situacao: "Em execução",
    situacaoPortal: "",
    situacaoContratacao: null,
    tipoContratacao: "Convênio",
    tipologia: null,
    convenente: { nome: "Unidade sintética", cnpj: null, tipo: "" },
    municipio: "SALVADOR",
    uf: "BA",
    codigoIbge: "",
    regiao: "Nordeste",
    orgao: "",
    unidadeGestora: "",
    subfuncao: "",
    funcao: "",
    tipoInstrumento: "",
    numeroProcesso: "",
    cnes: "0000001",
    cnesNomeEstabelecimento: "Unidade sintética",
    cnesMunicipio: null,
    programa: "Programa Alfa",
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
    ...extra,
  };
}

export function criarCarteiraOpcoes() {
  return [
    criarConvenioTeste({
      equipamentos: [
        criarMarcadorTeste("LINAC"),
        criarMarcadorTeste("Acelerador Linear", true),
        criarMarcadorTeste("123 - Cadeira hospitalar"),
      ],
    }),
    criarConvenioTeste({
      numero: "QA002",
      anoInstrumento: 2026,
      uf: "SP",
      municipio: "CAMPINAS",
      cnes: "0000002",
      tipoContratacao: "TED",
      programa: "Programa Beta",
      situacao: "Prestação de Contas Concluída",
      equipamentos: [criarMarcadorTeste("Mamógrafo", true)],
    }),
    criarConvenioTeste({
      numero: "QA003",
      cnes: null,
      anoInstrumento: null,
      tipoContratacao: null,
      programa: null,
      situacao: "",
      equipamentos: [criarMarcadorTeste("LINAC")],
    }),
  ];
}
