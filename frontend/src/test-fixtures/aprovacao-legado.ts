import type { CandidatoLegado } from "@/services/candidatos-legados";
import type { ProvaLegado } from "@/services/aprovacao-legado";

export function criarCandidato(
  overrides: Partial<CandidatoLegado> = {},
): CandidatoLegado {
  return {
    id: 7,
    numero: "999001",
    id_proposta: "111001",
    captura_id: 11,
    versao: 0,
    situacao: "novo",
    confirmacao_portal: "confirmado",
    origem: "siconv_oficial",
    data_publicacao: "2026-10-02",
    descoberto_em: "2026-10-18T10:00:00Z",
    verificado_em: "2026-10-18T10:00:00Z",
    componentes: [],
    evidencias: [
      {
        id_item: "1",
        codigo: "mamografo",
        nome: "Mamógrafo",
        descricao: "Aquisição de mamógrafo sintético",
        relacao: "aquisicao",
      },
    ],
    ...overrides,
  };
}

export function criarProva(overrides: Partial<ProvaLegado> = {}): ProvaLegado {
  return {
    candidato_id: 7,
    numero: "999001",
    captura_id: 11,
    recaptura_id: 21,
    versao: 0,
    hash_revisado: "a".repeat(64),
    situacao: "Em execução",
    valor_global: "1000.50",
    convenente_nome: "Instituição sintética",
    municipio: "Cidade sintética",
    uf: "BA",
    capturado_em: "2026-10-18T10:00:00Z",
    expira_em: "2026-10-19T10:00:00Z",
    ...overrides,
  };
}

export function criarAprovacao() {
  return {
    chave: "11111111-1111-4111-8111-111111111111",
    captura_id: 11,
    recaptura_id: 21,
    versao: 0,
    hash_revisado: "a".repeat(64),
    justificativa: "Conferência sintética da aquisição",
  };
}

export function criarDecisao() {
  return {
    id: 31,
    candidato_id: 7,
    captura_id: 11,
    usuario_id: 1,
    situacao_anterior: "novo",
    situacao: "aprovado",
    convenio_id: 41,
    recaptura_id: 21,
    justificativa: "Conferência sintética da aquisição",
    criado_em: "2026-10-18T11:00:00Z",
  };
}
