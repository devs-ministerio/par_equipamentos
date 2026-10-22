import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DURACAO_SESSAO_MS,
  assinarSessao,
  formatarTempoRestante,
  limparEmissaoSessao,
  obterExpiracaoSessao,
  registrarEmissaoSessao,
} from "./sessao-expiracao";

beforeEach(() => {
  const valores = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (chave: string) => valores.get(chave) ?? null,
    setItem: (chave: string, valor: string) => valores.set(chave, valor),
    removeItem: (chave: string) => valores.delete(chave),
  });
  limparEmissaoSessao();
});
afterEach(() => {
  limparEmissaoSessao();
  vi.unstubAllGlobals();
});

describe("relógio da sessão", () => {
  it("sem emissão registrada, expiração é desconhecida", () => {
    expect(obterExpiracaoSessao()).toBeNull();
  });

  it("mantém expiração desconhecida quando o armazenamento está indisponível", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => registrarEmissaoSessao()).not.toThrow();
    expect(obterExpiracaoSessao()).toBeNull();
  });

  it("expira DURACAO_SESSAO_MS depois da emissão", () => {
    expect(DURACAO_SESSAO_MS).toBe(60 * 60 * 1000);
    registrarEmissaoSessao(1_000);
    expect(obterExpiracaoSessao()).toBe(1_000 + DURACAO_SESSAO_MS);
  });

  it("avisa quem assinou ao registrar e ao limpar", () => {
    const ouvinte = vi.fn();
    const cancelar = assinarSessao(ouvinte);
    registrarEmissaoSessao();
    limparEmissaoSessao();
    expect(ouvinte).toHaveBeenCalledTimes(2);
    cancelar();
    registrarEmissaoSessao();
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });
});

describe("formatarTempoRestante", () => {
  it("formata mm:ss arredondando para cima", () => {
    expect(formatarTempoRestante(DURACAO_SESSAO_MS)).toBe("1:00:00");
    expect(formatarTempoRestante(61_500)).toBe("01:02");
    expect(formatarTempoRestante(1)).toBe("00:01");
  });

  it("usa h:mm:ss acima de uma hora e nunca fica negativo", () => {
    expect(formatarTempoRestante(3_909_000)).toBe("1:05:09");
    expect(formatarTempoRestante(-5_000)).toBe("00:00");
  });
});
