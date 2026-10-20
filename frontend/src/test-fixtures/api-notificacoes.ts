import { vi } from "vitest";
import { atualizarCsrfToken } from "@/lib/csrf";
import type { Notificacao } from "@/services/notificacoes";

export function criarAviso(
  id = 1,
  campos: Partial<Notificacao> = {},
): Notificacao {
  return {
    id,
    tipo: "atualizacao_api",
    titulo: `Convênio sintético ${id}`,
    corpo: "Situação oficial alterada",
    entidade_id: id,
    nivel_minimo: null,
    lida: false,
    arquivada: false,
    created_at: "2026-10-18T10:00:00Z",
    destino: null,
    ...campos,
  };
}

/** Simula apenas HTTP. Filtros e mutações são confirmados pela resposta da API. */
export function prepararApiNotificacoes(itens = [criarAviso()]) {
  const controle = {
    itens,
    erroConsulta: false,
    erroEscrita: false,
    consultar: undefined as (() => Promise<Response>) | undefined,
  };
  const json = (dados: unknown, status = 200) =>
    new Response(JSON.stringify(dados), { status });
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/me"))
      return json({
        id: 1,
        name: "Admin sintético",
        email: "qa@example.com",
        role: "admin",
        status: "active",
        created_at: "2026-10-18T10:00:00Z",
      });
    if (!/\/notificacoes(?:\/(?:\d+(?:\/arquivo)?|lidas))?$/.test(url.pathname))
      return json({ detail: "Rota sintética não configurada." }, 404);
    if (init?.method === "PATCH") {
      if (controle.erroEscrita)
        return json({ detail: "Falha temporária" }, 503);
      if (url.pathname.endsWith("/lidas")) {
        controle.itens = controle.itens.map((item) => ({
          ...item,
          lida: true,
        }));
        return json({ alteradas: controle.itens.length });
      }
      const partes = url.pathname.split("/");
      const arquivo = partes.at(-1) === "arquivo";
      const id = Number(partes.at(arquivo ? -2 : -1));
      controle.itens = controle.itens.map((item) =>
        item.id !== id
          ? item
          : {
              ...item,
              ...(arquivo ? JSON.parse(String(init.body)) : { lida: true }),
            },
      );
      return json(controle.itens.find((item) => item.id === id));
    }
    if (controle.consultar) return controle.consultar();
    if (controle.erroConsulta) return json({ detail: "Falha temporária" }, 503);
    const parametros = url.searchParams;
    const filtrados = controle.itens.filter(
      (item) =>
        item.arquivada === (parametros.get("arquivadas") === "true") &&
        (parametros.get("apenas_nao_lidas") !== "true" || !item.lida) &&
        (!parametros.get("busca") ||
          item.titulo.includes(parametros.get("busca")!)) &&
        (!parametros.get("tipo") || item.tipo === parametros.get("tipo")),
    );
    const offset = Number(parametros.get("offset") ?? 0);
    return json({
      itens: filtrados.slice(
        offset,
        offset + Number(parametros.get("limit") ?? 20),
      ),
      total: filtrados.length,
      nao_lidas: controle.itens.filter((item) => !item.lida && !item.arquivada)
        .length,
    });
  });
  vi.stubGlobal("fetch", fetch);
  atualizarCsrfToken("csrf-sintetico");
  return { controle, fetch, json };
}
