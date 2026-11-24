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
    vi.mocked(toast.info).mockClear();
  });

  it("reaparece a cada carregamento enquanto não for aberto e abre marcando a notificação", () => {
    const abrir = vi.fn();
    const lista = [aviso()];
    renderHook(() => useAvisoNovoInstrumento(lista, ana, abrir)).unmount();
    renderHook(() => useAvisoNovoInstrumento(lista, ana, abrir));
    expect(toast.info).toHaveBeenCalledTimes(2);
    const opcoes = vi.mocked(toast.info).mock.calls[1][1] as unknown as {
      duration: number;
      action: { onClick: () => void };
    };
    expect(opcoes.duration).toBe(Infinity);
    opcoes.action.onClick();
    expect(abrir).toHaveBeenCalledWith(lista[0]);
  });

  it("avisa o técnico responsável uma única vez por carregamento", () => {
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
