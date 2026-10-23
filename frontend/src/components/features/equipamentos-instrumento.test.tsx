import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import type { ItemEquipamento } from "@/services/entregas-equipamento";
import { EquipamentosInstrumentoFormEntrega } from "./equipamentos-instrumento-form-entrega";
import { EquipamentosInstrumentoLista } from "./equipamentos-instrumento-lista";

function item(sobrescrita: Partial<ItemEquipamento> = {}): ItemEquipamento {
  return {
    id: 1,
    codigo_item: "010925",
    descricao: "010925-Mamógrafo",
    familia: "mamografo",
    controla_unidade: true,
    quantidade_planejada: 2,
    quantidade_entregue: 1,
    situacao: "parcial",
    ultima_entrega: "2026-10-01",
    unidades: [
      {
        id: 9,
        entrega_id: 5,
        item_id: 1,
        ordem: 1,
        marca: "Marca X",
        modelo: "Modelo Y",
        numero_serie: "S1",
        vida_util_anos: 10,
        data_entrega: "2026-10-01",
      },
    ],
    ...sobrescrita,
  };
}

describe("lista de equipamentos do instrumento", () => {
  const props = {
    onRegistrar: vi.fn(),
    onCorrigir: vi.fn(),
    onExcluirEntrega: vi.fn().mockResolvedValue(undefined),
  };

  it("mostra situação, quantidades e unidades; editor vê as ações", async () => {
    const { container } = render(
      <EquipamentosInstrumentoLista {...props} itens={[item()]} podeEditar />,
    );
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByText("010925")).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Unidades \(1\)/));
    expect(screen.getByText("Série: S1")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar entrega de Mamógrafo" }),
    );
    expect(props.onRegistrar).toHaveBeenCalledWith(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("leitor não vê nenhuma ação e item entregue não oferece nova entrega", () => {
    const { rerender } = render(
      <EquipamentosInstrumentoLista
        {...props}
        itens={[item()]}
        podeEditar={false}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(
      <EquipamentosInstrumentoLista
        {...props}
        itens={[item({ situacao: "entregue", quantidade_entregue: 2 })]}
        podeEditar
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Registrar entrega/ }),
    ).not.toBeInTheDocument();
  });
});

describe("form de registrar entrega", () => {
  it("exige marcar pelo menos um equipamento", async () => {
    const onEnviar = vi.fn();
    render(
      <EquipamentosInstrumentoFormEntrega
        itens={[item()]}
        onEnviar={onEnviar}
        onFechar={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar entrega" }),
    );
    expect(
      await screen.findByText("Marque pelo menos um equipamento."),
    ).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("bloqueia quantidade acima do que falta", async () => {
    const onEnviar = vi.fn();
    render(
      <EquipamentosInstrumentoFormEntrega
        itens={[item()]}
        apenasItemId={1}
        onEnviar={onEnviar}
        onFechar={vi.fn()}
      />,
    );
    const quantidade = screen.getByLabelText("Quantidade");
    await userEvent.clear(quantidade);
    await userEvent.type(quantidade, "3");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar entrega" }),
    );
    expect(
      await screen.findByText("Acima do planejado: faltam 1."),
    ).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it("envia o item marcado com série e chave de idempotência", async () => {
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    const onFechar = vi.fn();
    render(
      <EquipamentosInstrumentoFormEntrega
        itens={[item()]}
        apenasItemId={1}
        onEnviar={onEnviar}
        onFechar={onFechar}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Números de série/), "ABC1");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar entrega" }),
    );
    await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1));
    const envio = onEnviar.mock.calls[0][0];
    expect(envio.chave).toBeTruthy();
    expect(envio.itens).toEqual([
      expect.objectContaining({ item_id: 1, quantidade: 1, series: ["ABC1"] }),
    ]);
    expect(onFechar).toHaveBeenCalled();
  });
});
