import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { fetchNotificacoes } from "./notificacoes";

afterEach(() => vi.unstubAllGlobals());

const avisoFonte = {
  id: 1,
  tipo: "fonte_indisponivel",
  titulo: "SICONV indisponível",
  corpo: "Os dados anteriores foram preservados.",
  entidade_id: 12,
  nivel_minimo: null,
  lida: false,
  created_at: "2026-10-06T10:00:00Z",
  destino: null,
  arquivada: false,
};

function responderAviso(tipo: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          itens: [{ ...avisoFonte, tipo }],
          total: 1,
          nao_lidas: 1,
        }),
        { status: 200 },
      ),
    ),
  );
}

describe("contrato de notificações das fontes", () => {
  it("aceita fonte indisponível sem rejeitar a lista de avisos", async () => {
    responderAviso("fonte_indisponivel");
    await expect(fetchNotificacoes()).resolves.toEqual({
      itens: [avisoFonte],
      total: 1,
      nao_lidas: 1,
    });
  });

  it("mantém rejeição de tipos não definidos no contrato", async () => {
    responderAviso("tipo_desconhecido");
    await expect(fetchNotificacoes()).rejects.toBeInstanceOf(ApiError);
  });
});
