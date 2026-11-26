import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limparCsrfToken } from "@/lib/csrf";
import { requisitar } from "@/lib/http-client";
import { gerarRelatorio } from "@/services/relatorios";

vi.mock("@/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http-client")>()),
  requisitar: vi.fn().mockResolvedValue({}),
}));

describe("período por data do evento (D02)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(requisitar).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    limparCsrfToken();
  });

  const filtro = {
    escopo: "brasil" as const,
    periodoPor: "data_do_evento" as const,
    dataInicio: "2026-01-01",
    dataFim: "2026-12-31",
  };

  it("o arquivo gerado envia a referência e as datas completas", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([80, 75]), {
        headers: { "content-disposition": 'attachment; filename="r.xlsx"' },
      }),
    );

    await gerarRelatorio("xlsx", "instrumentos_repasse", "simplificado", {
      ...filtro,
      encerramento: "encerrados",
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("periodo_por=data_do_evento");
    expect(url).toContain("data_inicio=2026-01-01");
    expect(url).toContain("data_fim=2026-12-31");
    expect(url).toContain("encerramento=encerrados");
  });
});
