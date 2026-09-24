import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { requisitar } from "@/lib/http-client";

/** Ambiente de teste é `node` (ver vite.config.ts) -- sem `window`/`document`
 * globais por padrão. `httpFetch` usa `typeof window !== 'undefined'` como
 * guarda (não quebra em SSR/teste), então o redirect só é observável se a
 * gente empilhar um `window`/`document` falso antes de cada teste. */
function stubBrowserGlobals(pathname = "/dashboard") {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { pathname, assign } });
  vi.stubGlobal("document", { cookie: "sigeo_csrf=token-abc" });
  return { assign };
}

/** `Response.json()` só pode ser lido 1x -- sempre gerar uma instância nova
 * por chamada de fetch (via `mockImplementation`), nunca reusar o mesmo
 * objeto `Response` em `mockResolvedValue` quando mais de 1 fetch pode
 * acontecer no teste (retry pós-refresh, tentativa de renovação etc.). */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("lib/http-client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valida a resposta com o schema e devolve o dado tipado", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { nome: "Tomógrafo" })),
    );

    const schema = z.object({ nome: z.string() });
    const dado = await requisitar("/equipamentos/1", schema, undefined);

    expect(dado).toEqual({ nome: "Tomógrafo" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/equipamentos/1");
    expect((init as RequestInit).credentials).toBe("include");
  });

  it("lança ApiError quando o payload não bate com o schema", async () => {
    stubBrowserGlobals();
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { nome: 123 })),
    );

    const schema = z.object({ nome: z.string() });
    await expect(
      requisitar("/equipamentos/1", schema, undefined),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("lança ApiError com mensagem de rede em falha de fetch", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    await expect(
      requisitar("/qualquer", z.object({}), undefined),
    ).rejects.toThrow(/Falha de rede/);
  });

  it("repete uma única leitura após timeout interno para absorver aquecimento do serviço", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("A solicitação excedeu 15 segundos."))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(
      requisitar("/auth/me", z.object({ ok: z.boolean() }), undefined),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("nunca repete mutação após timeout para não duplicar escrita", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("A solicitação excedeu 15 segundos."),
    );

    await expect(
      requisitar("/monitoramento/acoes", z.object({}), { method: "POST" }),
    ).rejects.toThrow(/Falha de rede/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("junta as mensagens de um detail de 422 em ARRAY ({loc,msg,type}) em vez de virar [object Object]", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(422, {
          error: "Dados invalidos",
          detail: [
            {
              loc: ["body", "email"],
              msg: "Formato de e-mail inválido",
              type: "value_error",
            },
            {
              loc: ["body", "password"],
              msg: "Campo obrigatório",
              type: "missing",
            },
          ],
        }),
      ),
    );

    await expect(
      requisitar("/auth/login", z.object({}), { method: "POST" }),
    ).rejects.toMatchObject({
      message: "Formato de e-mail inválido; Campo obrigatório",
      status: 422,
    });
  });

  it("usa detail direto quando é string, e cai pro error/status como fallback", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(404, { error: "Não encontrado", detail: null }),
      ),
    );
    await expect(
      requisitar("/x", z.object({}), undefined),
    ).rejects.toMatchObject({ message: "Não encontrado", status: 404 });

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(409, { detail: "Conflito de versão" })),
    );
    await expect(
      requisitar("/y", z.object({}), undefined),
    ).rejects.toMatchObject({ message: "Conflito de versão", status: 409 });
  });

  it("anexa X-CSRF-Token em mutação, mas não em GET", async () => {
    stubBrowserGlobals();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {})));

    await requisitar("/monitoramento/acoes", z.object({}), undefined);
    const initGet = fetchMock.mock.calls[0][1] as RequestInit;
    expect(
      (initGet.headers as Record<string, string>)["X-CSRF-Token"],
    ).toBeUndefined();

    await requisitar("/monitoramento/acoes", z.object({}), { method: "POST" });
    const initPost = fetchMock.mock.calls[1][1] as RequestInit;
    expect((initPost.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
      "token-abc",
    );
  });

  it("anexa um trace opaco e o preserva na repetição segura da mesma leitura", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("A solicitação excedeu 15 segundos."))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await requisitar("/auth/me", z.object({ ok: z.boolean() }), undefined);

    const primeira = fetchMock.mock.calls[0][1] as RequestInit;
    const segunda = fetchMock.mock.calls[1][1] as RequestInit;
    const primeiroTrace = (primeira.headers as Record<string, string>)[
      "X-Trace-Id"
    ];
    expect(primeiroTrace).toMatch(/^[0-9a-f]{32}$/);
    expect((segunda.headers as Record<string, string>)["X-Trace-Id"]).toBe(
      primeiroTrace,
    );
  });

  it("não anexa X-CSRF-Token em POST /auth/login (ainda não há sessão/cookie CSRF)", async () => {
    stubBrowserGlobals();
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { status: "ok" })),
    );

    await requisitar("/auth/login", z.object({ status: z.string() }), {
      method: "POST",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)["X-CSRF-Token"],
    ).toBeUndefined();
  });

  it("em 401, tenta renovar 1x via /auth/refresh e repete a chamada original", async () => {
    stubBrowserGlobals();
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(401, { error: "Não autenticado" })),
      ) // 1a chamada original
      .mockImplementationOnce(() => Promise.resolve(jsonResponse(200, {}))) // POST /auth/refresh
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(200, { ok: true })),
      ); // repete a chamada original

    const dado = await requisitar(
      "/monitoramento/instrumentos",
      z.object({ ok: z.boolean() }),
      undefined,
    );

    expect(dado).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
  });

  it("deduplica renovação: 2 chamadas simultâneas com 401 disparam só 1 POST /auth/refresh", async () => {
    stubBrowserGlobals();

    let resolveRefresh!: (r: Response) => void;
    const refreshPromise = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) return refreshPromise;
      if (url.includes("/dominio-a")) {
        // 1a chamada de cada endpoint: 401. 2a (pós-refresh): 200.
        const jaChamou = fetchMock.mock.calls.filter((c: unknown[]) =>
          String(c[0]).includes("/dominio-a"),
        ).length;
        return Promise.resolve(
          jaChamou <= 1
            ? jsonResponse(401, {})
            : jsonResponse(200, { origem: "a" }),
        );
      }
      if (url.includes("/dominio-b")) {
        const jaChamou = fetchMock.mock.calls.filter((c: unknown[]) =>
          String(c[0]).includes("/dominio-b"),
        ).length;
        return Promise.resolve(
          jaChamou <= 1
            ? jsonResponse(401, {})
            : jsonResponse(200, { origem: "b" }),
        );
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const schema = z.object({ origem: z.string() });
    const p1 = requisitar("/dominio-a", schema, undefined);
    const p2 = requisitar("/dominio-b", schema, undefined);

    // Dá tempo dos dois 401 iniciais chegarem e ambos tentarem renovar antes
    // do /auth/refresh resolver -- é o cenário que o mutex precisa deduplicar.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    resolveRefresh(jsonResponse(200, {}));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ origem: "a" });
    expect(r2).toEqual({ origem: "b" });

    const chamadasRefresh = fetchMock.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes("/auth/refresh"),
    );
    expect(chamadasRefresh).toHaveLength(1);
  });

  it("/auth/refresh e /auth/logout nunca tentam renovar (evita loop) e redirecionam em 401 definitivo", async () => {
    const { assign } = stubBrowserGlobals("/monitoramento-equipamentos");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(401, {})));

    await expect(
      requisitar("/auth/logout", z.object({}), { method: "POST" }),
    ).rejects.toMatchObject({ status: 401 });

    // Só a chamada original -- nenhuma tentativa de POST /auth/refresh
    // (evitaria loop óbvio: 401 em /auth/refresh tentando se renovar via /auth/refresh).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("redirecionarEm401:false não redireciona (uso de fetchCurrentUser em página pública)", async () => {
    const { assign } = stubBrowserGlobals("/");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(401, {})));

    await expect(
      requisitar("/auth/me", z.object({}), undefined, {
        redirecionarEm401: false,
      }),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("não redireciona quando já está em /login", async () => {
    const { assign } = stubBrowserGlobals("/login");
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(401, {})));

    await expect(
      requisitar("/monitoramento/instrumentos", z.object({}), undefined),
    ).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });
});
