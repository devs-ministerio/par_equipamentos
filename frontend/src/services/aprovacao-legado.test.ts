import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { atualizarCsrfToken, limparCsrfToken } from "@/lib/csrf";
import {
  criarAprovacao,
  criarDecisao,
  criarProva,
} from "@/test-fixtures/aprovacao-legado";
import { enviarAprovacaoLegado, fetchProvaLegado } from "./aprovacao-legado";

afterEach(() => {
  vi.unstubAllGlobals();
  limparCsrfToken();
});

function responder(payload: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify(payload), { status }),
  );
  vi.stubGlobal("fetch", fetch);
  atualizarCsrfToken("csrf-sintetico");
  return fetch;
}

describe("contrato de aprovação do Radar", () => {
  it("consulta a prova sem enviar payload, respeitando o candidato solicitado", async () => {
    // Arrange
    const prova = criarProva();
    const fetch = responder(prova);
    // Act
    expect(await fetchProvaLegado(7)).toEqual(prova);
    // Assert
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/7\/prova$/);
    expect(fetch.mock.calls[0][1]?.body).toBeUndefined();
  });

  it.each([
    { candidato_id: 8 },
    { hash_revisado: "inválido" },
    { valor_global: "1.000,50" },
    { expira_em: "ontem" },
    { recaptura_id: null },
  ])("recusa prova incompatível ou malformada %j", async (alteracao) => {
    // Arrange
    responder({ ...criarProva(), ...alteracao });
    // Act / Assert
    await expect(fetchProvaLegado(7)).rejects.toBeInstanceOf(ApiError);
  });

  it("envia somente a referência revisada, com CSRF e credenciais", async () => {
    // Arrange
    const fetch = responder(criarDecisao());
    const pedido = criarAprovacao();
    // Act
    expect(await enviarAprovacaoLegado(7, pedido)).toEqual(criarDecisao());
    // Assert
    const [, init] = fetch.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
      "csrf-sintetico",
    );
    expect(JSON.parse(String(init?.body))).toEqual(pedido);
  });

  it.each([
    { justificativa: " " },
    { chave: "inválida" },
    { versao: -1 },
    { payload_oficial: {} },
  ])("recusa comando inválido antes da rede %j", async (alteracao) => {
    // Arrange
    const fetch = responder(criarDecisao());
    // Act / Assert
    await expect(
      enviarAprovacaoLegado(7, { ...criarAprovacao(), ...alteracao }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["candidato_id", "captura_id", "recaptura_id"])(
    "recusa resposta vinculada a outra %s",
    async (campo) => {
      // Arrange
      responder({ ...criarDecisao(), [campo]: 999 });
      // Act / Assert
      await expect(
        enviarAprovacaoLegado(7, criarAprovacao()),
      ).rejects.toBeInstanceOf(ApiError);
    },
  );

  it.each([403, 409, 503])(
    "preserva erro HTTP %s sem interpretar como aprovação",
    async (status) => {
      // Arrange
      responder({ error: "Operação recusada." }, status);
      // Act / Assert
      await expect(
        enviarAprovacaoLegado(7, criarAprovacao()),
      ).rejects.toMatchObject({
        status,
        message: "Operação recusada.",
        publicMessage:
          status < 500
            ? "Operação recusada."
            : "Não foi possível completar a operação. Tente novamente em instantes.",
      });
    },
  );
});
