import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Notificacao } from "@/services/notificacoes";
import { NotificacaoItem } from "./notificacao-item";

const aviso: Notificacao = {
  id: 1,
  tipo: "atualizacao_api",
  titulo: "Convênio 825374: atualização oficial",
  corpo: "Situação: Em execução → Concluído; Valor: 100 → 120",
  entidade_id: 1,
  nivel_minimo: null,
  lida: false,
  arquivada: false,
  created_at: "2026-10-06T10:00:00Z",
  destino: null,
};

describe("NotificacaoItem", () => {
  it("identifica o card e mostra a mensagem completa sem expansão", () => {
    render(
      <NotificacaoItem
        aviso={aviso}
        ocupada={false}
        abrir={vi.fn()}
        arquivar={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("article", { name: aviso.titulo }),
    ).toBeInTheDocument();
    expect(screen.getByText("Não lida")).toBeVisible();
    expect(screen.getByText(/Valor: 100 → 120/)).toBeVisible();
    expect(screen.queryByText("Ver alterações")).not.toBeInTheDocument();
    expect(screen.queryByText("Ver mensagem")).not.toBeInTheDocument();
  });

  it("mantém as ações individuais e seus respectivos registros", async () => {
    const user = userEvent.setup();
    const abrir = vi.fn().mockResolvedValue(undefined);
    const arquivar = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificacaoItem
        aviso={aviso}
        ocupada={false}
        abrir={abrir}
        arquivar={arquivar}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Marcar como lida" }));
    expect(abrir).toHaveBeenCalledWith(aviso);
    await user.click(screen.getByRole("button", { name: "Arquivar" }));
    expect(arquivar).toHaveBeenCalledWith(aviso);
  });

  it("oferece restauração e abertura para um aviso arquivado e bloqueia ações em andamento", () => {
    render(
      <NotificacaoItem
        aviso={{
          ...aviso,
          lida: true,
          arquivada: true,
          destino: "/monitoramento-equipamentos",
        }}
        ocupada
        abrir={vi.fn()}
        arquivar={vi.fn()}
      />,
    );
    expect(screen.getByText("Arquivada")).toBeVisible();
    expect(screen.getByRole("button", { name: "Restaurar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Abrir registro" }),
    ).toBeDisabled();
  });

  it("não cria detalhes vazios ou ação de leitura para aviso já lido", () => {
    render(
      <NotificacaoItem
        aviso={{ ...aviso, lida: true, corpo: null }}
        ocupada={false}
        abrir={vi.fn()}
        arquivar={vi.fn()}
      />,
    );
    expect(screen.getByText("Lida")).toBeVisible();
    expect(screen.queryByText("Ver alterações")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Marcar como lida" }),
    ).not.toBeInTheDocument();
  });
});
