import type { PropostaCandidata } from "@/services/propostas-candidatas";
import { criarConvenioTeste } from "./dados-oficiais";

export function criarInstrumentosPrevia(total: number) {
  return Array.from({ length: total }, (_, indice) => {
    const sufixo = String(indice + 1).padStart(3, "0");
    return criarConvenioTeste({
      numero: `QA${sufixo}`,
      convenente: { nome: `Unidade ${sufixo}`, cnpj: null, tipo: "" },
    });
  });
}

export function criarPropostaPrevia(
  indice = 1,
  overrides: Partial<PropostaCandidata> = {},
): PropostaCandidata {
  const sufixo = String(indice).padStart(3, "0");
  return {
    id: indice,
    id_proposta: 1000 + indice,
    cnpj_ente_recebedor: "00000000000000",
    nm_proponente: `Unidade ${sufixo}`,
    municipio: "SALVADOR",
    uf: "BA",
    ds_objeto: "Objeto sintético",
    nm_programa: "Programa sintético",
    id_programa: 1,
    componente_batido: "Componente sintético",
    equipamentos: [],
    equipamento_detectado: null,
    vl_global_proposta: null,
    situacao_proposta: "Em Análise",
    data_proposta: "2026-10-20",
    metas_resumo: null,
    cnes: null,
    cnes_nome_estabelecimento: null,
    tem_parceria: false,
    cd_parceria: null,
    created_at: "2026-10-20T10:00:00Z",
    ...overrides,
  };
}

export function criarPropostasPrevia(total: number) {
  return Array.from({ length: total }, (_, i) => criarPropostaPrevia(i + 1));
}
