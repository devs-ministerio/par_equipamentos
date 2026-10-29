import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { fetchUsuarios } from "./usuarios";

afterEach(() => vi.unstubAllGlobals());

function respostaUsuarios(ultimoLogin: string | null | undefined) {
  return {
    itens: [
      {
        id: 1,
        name: "Usuário sintético",
        email: "qa@example.com",
        role: "colaborador",
        status: "active",
        created_at: "2026-10-20T10:00:00Z",
        activated_at: null,
        ultimo_login_em: ultimoLogin,
      },
    ],
    total: 1,
  };
}

describe("contrato do último login administrativo", () => {
  it.each([
    "2026-10-27T10:00:00Z",
    "2026-10-27T07:00:00-03:00",
    null,
    undefined,
  ])("preserva timestamp ou ausência %s da API", async (ultimoLogin) => {
    // Arrange
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(respostaUsuarios(ultimoLogin))),
        ),
    );
    // Act
    const resposta = await fetchUsuarios();
    // Assert
    expect(resposta.itens[0].ultimo_login_em).toBe(ultimoLogin);
    expect(resposta.total).toBe(1);
  });

  it("rejeita data inválida sem passá-la à interface", async () => {
    // Arrange
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(respostaUsuarios("data-invalida"))),
        ),
    );
    // Act / Assert
    await expect(fetchUsuarios()).rejects.toBeInstanceOf(ApiError);
  });
});
