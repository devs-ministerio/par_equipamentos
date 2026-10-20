import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { atualizarCsrfToken, limparCsrfToken } from "@/lib/csrf";
import type { AuthUser } from "@/services/auth";
import { criarCandidato, criarDecisao, criarProva } from "./aprovacao-legado";

const clientes: QueryClient[] = [];
export const fonteSintetica = {
  fonte: "siconv_descoberta",
  rotulo: "Descoberta de convênios",
  status: "parcial",
  ultima_tentativa_em: "2026-10-19T10:00:00Z",
  ultimo_sucesso_em: "2026-10-18T10:00:00Z",
  defasada: true,
  itens_verificados: 2,
  itens_alterados: 0,
  erro: "Fonte incompleta; última captura preservada.",
};

export function prepararHooksRadar(role: AuthUser["role"] = "admin") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
    },
  });
  clientes.push(client);
  const controle = {
    usuario: {
      id: 1,
      name: "Pessoa sintética",
      email: "qa@example.com",
      role,
      status: "active",
      created_at: "2026-10-19T10:00:00Z",
    } as AuthUser | null,
    candidato: criarCandidato(),
    prova: criarProva(),
    fontes: [fonteSintetica] as unknown,
    pagina: undefined as unknown,
    interceptar: undefined as
      | ((url: URL, init?: RequestInit) => Response | undefined)
      | undefined,
    historico: [] as Array<
      ReturnType<typeof criarDecisao> & { usuario_nome: string }
    >,
  };
  const json = (dado: unknown, status = 200) =>
    new Response(JSON.stringify(dado), { status });
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    const especial = controle.interceptar?.(url, init);
    if (especial) return especial;
    if (url.pathname.endsWith("/auth/me"))
      return controle.usuario
        ? json(controle.usuario)
        : json({ detail: "Sem sessão" }, 401);
    if (url.pathname.endsWith("/auth/csrf"))
      return json({ csrf_token: "csrf-sintetico" });
    if (url.pathname.endsWith("/auth/refresh"))
      return json({ detail: "Sessão expirada" }, 401);
    if (url.pathname.endsWith("/decisoes")) {
      const decisao = { ...criarDecisao(), situacao: "em_analise" };
      controle.candidato = {
        ...controle.candidato,
        situacao: "em_analise",
        versao: decisao.id,
      };
      controle.historico = [{ ...decisao, usuario_nome: "Pessoa sintética" }];
      return json(decisao);
    }
    if (url.pathname.endsWith("/aprovacoes")) {
      controle.candidato = {
        ...controle.candidato,
        situacao: "aprovado",
        versao: 31,
      };
      controle.historico = [
        { ...criarDecisao(), usuario_nome: "Pessoa sintética" },
      ];
      return json(criarDecisao());
    }
    if (url.pathname.endsWith("/prova")) return json(controle.prova);
    if (url.pathname.endsWith("/historico"))
      return json({
        total: controle.historico.length,
        itens: controle.historico,
      });
    if (url.pathname.endsWith("/candidatos-legados"))
      return json(
        controle.pagina ?? {
          total: 1,
          novos: controle.candidato.situacao === "novo" ? 1 : 0,
          itens: [controle.candidato],
        },
      );
    if (url.pathname.endsWith("/fontes/capturas")) return json(controle.fontes);
    if (url.pathname.endsWith("/propostas-candidatas"))
      return json({ total: 0, itens: [] });
    return json({ detail: "Rota sintética não configurada" }, 404);
  });
  vi.stubGlobal("fetch", fetch);
  atualizarCsrfToken("csrf-sintetico");
  window.history.replaceState(null, "", "/login");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const chamadas = (trecho: string) =>
    fetch.mock.calls.filter(([url]) => String(url).includes(trecho));
  return { client, wrapper, controle, fetch, json, chamadas };
}

export function limparHooksRadar() {
  for (const client of clientes.splice(0)) client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  limparCsrfToken();
}
