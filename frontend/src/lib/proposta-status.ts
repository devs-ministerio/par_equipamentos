import { campo, lista } from "@/lib/campo-cru";

/** Situação "de fato" -- achado 2026-09-15, pedido do usuário: "troque o
 * aprovada pela última situação de fato". `situacao_proposta` (Aprovada)
 * fica ESTÁTICA pra sempre, a proposta nunca "desaprova" -- quem realmente
 * evolui é a execução financeira, capturada em timeline_financeira. Ordem
 * de prioridade (mais recente/real primeiro): ordem de pagamento -> DH ->
 * empenho -> situação da parceria -> situação da proposta (só cai aqui
 * quando não há timeline nenhuma, proposta sem parceria ainda). */
export function situacaoDeFato(p: {
  situacao_proposta: string | null;
  metas_resumo: Record<string, unknown> | null;
}): string | null {
  const tl = p.metas_resumo?.timeline_financeira;
  if (tl && typeof tl === "object") {
    const ordens = lista(tl, "ordens_pagamento");
    if (ordens.length)
      return campo(ordens[ordens.length - 1], "in_situacao_op");
    const docs = lista(tl, "documentos_habeis");
    if (docs.length) return campo(docs[docs.length - 1], "in_situacao_dh");
    const empenhos = lista(tl, "empenhos");
    if (empenhos.length)
      return campo(empenhos[empenhos.length - 1], "in_situacao_siafi");
  }
  const parceriaSit = campo(p.metas_resumo?.parceria, "in_situacao_parceria");
  return parceriaSit || p.situacao_proposta;
}

/** Estágio no funil Proposta -> Parceria (pedido do usuário 2026-09-18,
 * organizar "Linhas de financiamento" por esse fluxo em vez de lista
 * plana): "confirmada" quando já existe parceria formalizada na API
 * (`tem_parceria`, ver PropostaCandidata em app/db/models.py) -- é fato
 * consumado, tem cd_parceria/NUP SEI reais. "tramitacao" quando ainda é só
 * proposta -- pode virar parceria ou ser rejeitada, nada é definitivo
 * ainda. Rótulo na UI cita o termo técnico entre parênteses ("Confirmada
 * (parceria)"/"Em tramitação (proposta)") pra quem já conhece o
 * TransfereGov reconhecer, sem virar jargão como rótulo principal. */
export type EstagioProposta = "confirmada" | "tramitacao";

export function estagioDeFato(p: { tem_parceria: boolean }): EstagioProposta {
  return p.tem_parceria ? "confirmada" : "tramitacao";
}

export const ESTAGIO_LABEL: Record<EstagioProposta, string> = {
  confirmada: "Confirmada (parceria)",
  tramitacao: "Em tramitação (proposta)",
};

/** Ordem fixa de exibição dentro de cada estágio -- mais avançado no
 * funil primeiro. Situação fora desta lista (vocabulário livre da API)
 * aparece depois, na ordem em que a agregação encontrar. */
export const ORDEM_SITUACAO_POR_ESTAGIO: Record<EstagioProposta, string[]> = {
  confirmada: ["Paga", "Empenhada", "Aprovada"],
  tramitacao: ["Em Análise", "Em Elaboração", "Aprovada", "Rejeitada"],
};
