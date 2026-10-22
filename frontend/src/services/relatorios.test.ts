import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { limparCsrfToken } from "@/lib/csrf";
import { httpFetch } from "@/lib/http-client";
import { gerarRelatorio } from "@/services/relatorios";

describe("exportação de relatórios", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    limparCsrfToken();
  });

  it.each(["docx", "xlsx"] as const)(
    "preserva arquivo %s, nome, filtros e sessão após os 15 segundos usuais",
    async (formato) => {
      fetchMock.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return new Response(new Uint8Array([80, 75, 3, 4, 0, 255]), {
          headers: {
            "content-disposition": `attachment; filename="recorte.${formato}"`,
          },
        });
      });
      const geracao = gerarRelatorio(
        formato,
        "instrumentos_repasse",
        "completo",
        {
          escopo: "cnes",
          cnes: "0012345",
          uf: "BA",
          busca: "São José & Saúde",
          anoInicio: 2025,
          anoFim: 2026,
        },
      );
      await vi.advanceTimersByTimeAsync(20_000);
      const arquivo = await geracao;
      expect(arquivo.nomeArquivo).toBe(`recorte.${formato}`);
      expect(new Uint8Array(await arquivo.blob.arrayBuffer())).toEqual(
        new Uint8Array([80, 75, 3, 4, 0, 255]),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      const params = new URL(String(url)).searchParams;
      expect(params.get("cnes")).toBe("0012345");
      expect(params.get("busca")).toBe("São José & Saúde");
      expect(params.get("ano_inicio")).toBe("2025");
      expect(params.get("ano_fim")).toBe("2026");
      expect(init?.credentials).toBe("include");
      expect(init?.signal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["cabeçalhos", "corpo"])(
    "encerra em 90 segundos quando o recebimento dos %s fica pendurado, sem repetir",
    async (etapa) => {
      let signal: AbortSignal | undefined;
      fetchMock.mockImplementation(async (_url, init) => {
        signal = init?.signal ?? undefined;
        if (etapa === "cabeçalhos") {
          return await new Promise<Response>((_, reject) => {
            signal?.addEventListener("abort", () => reject(signal?.reason), {
              once: true,
            });
          });
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              signal?.addEventListener(
                "abort",
                () => controller.error(signal?.reason),
                { once: true },
              );
            },
          }),
        );
      });
      const geracao = gerarRelatorio("docx", "analise_merito", "completo", {
        escopo: "brasil",
      });
      const rejeicao = expect(geracao).rejects.toMatchObject({
        publicMessage: expect.stringContaining("A geração excedeu 90 segundos"),
      });
      await vi.advanceTimersByTimeAsync(89_999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejeicao;
      expect(signal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("preserva erro 503 de admissão, sem tentar gerar novamente", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "Há outro relatório em geração." }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    await expect(
      gerarRelatorio("docx", "analise_merito", "completo", {
        escopo: "brasil",
      }),
    ).rejects.toMatchObject({
      status: 503,
      publicMessage: expect.stringContaining("temporariamente indisponível"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("normaliza falha na leitura do arquivo e libera o prazo", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({ start: (c) => c.error(new Error("rede")) }),
      ),
    );
    await expect(
      gerarRelatorio("xlsx", "instrumentos_repasse", "completo", {
        escopo: "brasil",
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renova sessão expirada uma vez antes de receber o arquivo", async () => {
    limparCsrfToken();
    vi.stubGlobal("document", { cookie: "" });
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ csrf_token: "csrf-sintetico" }))
      .mockResolvedValueOnce(Response.json({ csrf_token: "csrf-renovado" }))
      .mockResolvedValueOnce(new Response("arquivo após renovação"));
    const arquivo = await gerarRelatorio("docx", "analise_merito", "completo", {
      escopo: "uf",
      uf: "BA",
    });
    expect(await arquivo.blob.text()).toBe("arquivo após renovação");
    expect(arquivo.nomeArquivo).toBe("relatorio-sem-nome.docx");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const rotas = fetchMock.mock.calls.map(
      ([url]) => new URL(String(url)).pathname,
    );
    expect(rotas).toEqual([
      "/relatorios",
      "/auth/csrf",
      "/auth/refresh",
      "/relatorios",
    ]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": "csrf-sintetico" },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mantém 15 segundos e uma repetição no GET comum, sem mudar a política global", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    });
    const leitura = httpFetch("/outra-rota");
    const rejeicao = expect(leitura).rejects.toThrow(/excedeu 15 segundos/);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejeicao;
    expect(vi.getTimerCount()).toBe(0);
  });
});
