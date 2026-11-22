import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { criarAviso } from "@/test-fixtures/api-notificacoes";
import { NotificacaoDetalheDialog } from "./notificacao-detalhe-dialog";
import { abreDetalhe } from "@/lib/notificacao-detalhe";

const corpo =
  "Situação do convênio: Em execução → Concluído\n\nPagamentos: 1 novo(s), 1 alterado(s)\n• Registro 7: Valor do empenho: 10 → 20\n• Novo registro: Nº do documento de liquidação: 970";

describe("NotificacaoDetalheDialog", () => {
  it("só atualização oficial com texto abre o popup", () => {
    expect(abreDetalhe(criarAviso(1, { tipo: "atualizacao_api", corpo }))).toBe(
      true,
    );
    expect(
      abreDetalhe(criarAviso(1, { tipo: "atualizacao_api", corpo: null })),
    ).toBe(false);
    expect(abreDetalhe(criarAviso(1, { tipo: "edicao_manual", corpo }))).toBe(
      false,
    );
  });

  it("mostra o texto completo e abre o instrumento", async () => {
    const user = userEvent.setup();
    const irParaRegistro = vi.fn();
    render(
      <NotificacaoDetalheDialog
        aviso={criarAviso(1, {
          corpo,
          destino: "/monitoramento-equipamentos/instrumentos/825374",
        })}
        fechar={vi.fn()}
        irParaRegistro={irParaRegistro}
      />,
    );
    expect(
      screen.getByText("Situação do convênio: Em execução → Concluído"),
    ).toBeVisible();
    expect(
      screen.getByText("• Registro 7: Valor do empenho: 10 → 20"),
    ).toBeVisible();
    expect(
      screen.getByText("• Novo registro: Nº do documento de liquidação: 970"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Abrir instrumento" }));
    expect(irParaRegistro).toHaveBeenCalledWith(
      "/monitoramento-equipamentos/instrumentos/825374",
    );
  });

  it("aviso antigo de uma linha é quebrado por campo e resumo sem destino não oferece abrir", () => {
    render(
      <NotificacaoDetalheDialog
        aviso={criarAviso(1, { corpo: "Situação: A → B; Valor: 1 → 2" })}
        fechar={vi.fn()}
        irParaRegistro={vi.fn()}
      />,
    );
    expect(screen.getByText("Situação: A → B")).toBeVisible();
    expect(screen.getByText("Valor: 1 → 2")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Abrir instrumento" }),
    ).not.toBeInTheDocument();
  });
});
