import { vi } from "vitest";
import { atualizarCsrfToken } from "@/lib/csrf";
import { criarCandidato, criarDecisao, criarProva } from "./aprovacao-legado";
import type { CandidatoLegado } from "@/services/candidatos-legados";

/** Somente a fronteira HTTP é substituída; hooks, services e formulários são reais. */
export function prepararApiAprovacao({
  role = "admin",
  candidato = criarCandidato(),
}: { role?: string; candidato?: CandidatoLegado } = {}) {
  const controle = {
    candidato,
    prova: criarProva(),
    consultar: undefined as (() => Promise<Response>) | undefined,
    aprovar: undefined as ((pedido: unknown) => Promise<Response>) | undefined,
  };
  const json = (dados: unknown, status = 200) =>
    new Response(JSON.stringify(dados), { status });
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/me"))
      return json({
        id: 1,
        name: "Gestão sintética",
        email: "qa@example.com",
        role,
        status: "active",
        created_at: "2026-10-18T10:00:00Z",
      });
    if (url.pathname.endsWith("/prova"))
      return controle.consultar ? controle.consultar() : json(controle.prova);
    if (url.pathname.endsWith("/aprovacoes")) {
      if (controle.aprovar)
        return controle.aprovar(JSON.parse(String(init?.body)));
      controle.candidato = {
        ...controle.candidato,
        situacao: "aprovado",
        versao: 31,
      };
      return json(criarDecisao());
    }
    if (url.pathname.endsWith("/candidatos-legados"))
      return json({
        total: 1,
        novos: controle.candidato.situacao === "novo" ? 1 : 0,
        itens: [controle.candidato],
      });
    return json({ error: "Rota sintética não configurada." }, 404);
  });
  vi.stubGlobal("fetch", fetch);
  atualizarCsrfToken("csrf-sintetico");
  return { controle, fetch, json };
}
