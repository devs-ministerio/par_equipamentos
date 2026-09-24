/** Chaves de query do domínio monitoramento-equipamento centralizadas num
 * lugar só -- evita string mágica duplicada entre o hook que busca e o
 * hook/mutação que precisa invalidar a mesma chave (ver TanStack Query
 * docs: "Query Keys are hashed deterministically"). */
export const monitoramentoKeys = {
  marcos: ["monitoramento", "marcos"] as const,
  instrumentos: ["monitoramento", "instrumentos"] as const,
  instrumento: (nrConvenio: string) =>
    ["monitoramento", "instrumento", nrConvenio] as const,
  acoes: (pendentes?: boolean) =>
    ["monitoramento", "acoes", pendentes ?? "todas"] as const,
  resumo: ["monitoramento", "resumo"] as const,
  currentUser: ["auth", "me"] as const,
  notificacoes: (apenasNaoLidas?: boolean) =>
    ["notificacoes", apenasNaoLidas ?? "todas"] as const,
  propostasCandidatas: () => ["propostas-candidatas"] as const,
  usuarios: (filtro?: unknown) => ["usuarios", filtro ?? "todos"] as const,
};
