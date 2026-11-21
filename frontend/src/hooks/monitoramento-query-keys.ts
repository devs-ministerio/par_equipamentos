/** Chaves de query do domínio monitoramento-equipamento centralizadas num
 * lugar só -- evita string mágica duplicada entre o hook que busca e o
 * hook/mutação que precisa invalidar a mesma chave (ver TanStack Query
 * docs: "Query Keys are hashed deterministically"). */
export const monitoramentoKeys = {
  marcos: ["monitoramento", "marcos"] as const,
  instrumentos: ["monitoramento", "instrumentos"] as const,
  instrumento: (nrConvenio: string) =>
    ["monitoramento", "instrumento", nrConvenio] as const,
  acoesDoInstrumento: (nr: string) =>
    ["monitoramento", "acoes", "instrumento", nr] as const,
  acoes: (pendentes?: boolean) =>
    ["monitoramento", "acoes", pendentes ?? "todas"] as const,
  resumo: ["monitoramento", "resumo"] as const,
  /** Avaliação de conclusão de todos os instrumentos (prefixo): muda com ações, entregas, unidades e eventos. */
  conclusao: ["monitoramento", "conclusao"] as const,
  currentUser: ["auth", "me"] as const,
  notificacoesBase: ["notificacoes"] as const,
  notificacoes: (apenasNaoLidas?: boolean) =>
    ["notificacoes", apenasNaoLidas ?? "todas"] as const,
  propostasCandidatas: () => ["propostas-candidatas"] as const,
  usuarios: (filtro?: unknown) => ["usuarios", filtro ?? "todos"] as const,
  auditoria: (filtro?: unknown) => ["auditoria", filtro ?? "todos"] as const,
};
