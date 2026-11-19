import { renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Notificacao } from "@/services/notificacoes";
import { useAvisoNovoInstrumento } from "./use-aviso-novo-instrumento";

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

const agora = new Date().toISOString();
function aviso(sobras: Partial<Notificacao> = {}): Notificacao {
  return {
    id: 1,
    tipo: "inclusao_monitoramento",
    titulo: "Instrumento 999001 incluído no monitoramento",
    corpo: "Convênio · responsável: Ana Técnica · incluído por Gestor",
    entidade_id: 9,
    nivel_minimo: null,
    lida: false,
    created_at: agora,
    destino: "/monitoramento-equipamentos/instrumentos/999001",
    arquivada: false,
    ...sobras,
  };
}
const ana = { id: 7, name: "Ana Técnica" };

describe("aviso de instrumento novo", () => {
  beforeEach(() => {
    const guardado = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
    });
    vi.mocked(toast.info).mockClear();
  });

  it("avisa o técnico responsável uma única vez", () => {
    const abrir = vi.fn();
    const { rerender } = renderHook(
      ({ lista }) => useAvisoNovoInstrumento(lista, ana, abrir),
      { initialProps: { lista: [aviso()] } },
    );
    rerender({ lista: [aviso()] });
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.info).mock.calls[0][0]).toContain("999001");
  });

  it("não avisa quem só incluiu o instrumento", () => {
    renderHook(() =>
      useAvisoNovoInstrumento([aviso()], { id: 2, name: "Gestor" }, vi.fn()),
    );
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("ignora aviso já lido, de outro tipo ou antigo", () => {
    const velho = new Date(Date.now() - 9 * 86_400_000).toISOString();
    renderHook(() =>
      useAvisoNovoInstrumento(
        [
          aviso({ id: 1, lida: true }),
          aviso({ id: 2, tipo: "edicao_manual" }),
          aviso({ id: 3, created_at: velho }),
        ],
        ana,
        vi.fn(),
      ),
    );
    expect(toast.info).not.toHaveBeenCalled();
  });
});
