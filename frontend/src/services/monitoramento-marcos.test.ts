import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./monitoramento-client";
import { fetchMarcos } from "./monitoramento-marcos";

vi.mock("./monitoramento-client", () => ({ apiGet: vi.fn() }));

describe("catálogo de marcos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consulta o catálogo público fixo", async () => {
    const marcos = [
      {
        id: 1,
        codigo: "fase-inicial",
        grupo: "fase_geral",
        ordem: 1,
        execucao_fisica_pct_referencia: 0,
        rotulo: "Início",
        descricao_referencia: null,
      },
    ];
    vi.mocked(apiGet).mockResolvedValueOnce(marcos);

    await expect(fetchMarcos()).resolves.toEqual(marcos);
    expect(apiGet).toHaveBeenCalledWith(
      "/monitoramento/marcos",
      expect.anything(),
    );
  });
});
