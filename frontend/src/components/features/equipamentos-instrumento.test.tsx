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
    nome: "Mamógrafo",
    descricao:
      "Mamógrafo digital com estereotaxia, detector de 24x30 cm - especificação técnica longa informada na API",
    familia: "mamografo",
    controla_unidade: true,
    quantidade_planejada: 2,
    quantidade_entregue: 1,
    situacao: "parcial",
    ultima_entrega: "2026-10-01",
    rendimentos: [],
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

  it("mostra o nome da RENEM e nunca a descrição informada na API", () => {
    render(
      <EquipamentosInstrumentoLista
        {...props}
        itens={[item()]}
        podeEditar={false}
      />,
    );
    expect(screen.getByText("Mamógrafo")).toBeInTheDocument();
    expect(
      screen.queryByText(/especificação técnica longa/),
    ).not.toBeInTheDocument();
  });
  it("mostra situação, quantidades e unidades; editor vê as ações", async () => {
    const { container } = render(
      <EquipamentosInstrumentoLista {...props} itens={[item()]} podeEditar />,
    );
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByText("010925")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Ver unidades de Mamógrafo" }),
    );
    expect(screen.getByText("Série: S1")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar entrega de Mamógrafo" }),
    );
    expect(props.onRegistrar).toHaveBeenCalledWith(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("mostra o rendimento como linha filha, sem somar unidade", () => {
    render(
      <EquipamentosInstrumentoLista
        {...props}
        itens={[
          item({
            rendimentos: [
              { id: 5, descricao: "Rendimento", valor_total: 1500 },
            ],
          }),
        ]}
        podeEditar={false}
      />,
    );
    expect(
      screen.getByText(/Rendimento da aplicação: R\$\s?1\.500,00/),
    ).toBeInTheDocument();
    expect(screen.getByText(/não soma unidade/)).toBeInTheDocument();
  });

  it("leitor não vê nenhuma ação e item entregue não oferece nova entrega", () => {
    const { rerender } = render(
      <EquipamentosInstrumentoLista
        {...props}
        itens={[item()]}
        podeEditar={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Registrar entrega/ }),
    ).not.toBeInTheDocument();
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

  it("não deixa adicionar mais unidades do que falta", async () => {
    render(
      <EquipamentosInstrumentoFormEntrega
        itens={[item()]}
        apenasItemId={1}
        onEnviar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Adicionar unidade" }),
    ).toBeDisabled();
  });

  it("lança cada unidade com os próprios dados", async () => {
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    const onFechar = vi.fn();
    render(
      <EquipamentosInstrumentoFormEntrega
        itens={[item({ quantidade_planejada: 3, quantidade_entregue: 0 })]}
        apenasItemId={1}
        onEnviar={onEnviar}
        onFechar={onFechar}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Adicionar unidade" }),
    );
    const marcas = screen.getAllByLabelText("Marca");
    const series = screen.getAllByLabelText("Nº de série");
    await userEvent.type(marcas[0], "A");
    await userEvent.type(series[0], "S1");
    await userEvent.type(marcas[1], "B");
    await userEvent.type(series[1], "S2");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar entrega" }),
    );
    await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1));
    const { chave, itens } = onEnviar.mock.calls[0][0];
    expect(chave).toBeTruthy();
    expect(itens[0].unidades).toEqual([
      expect.objectContaining({ marca: "A", numero_serie: "S1" }),
      expect.objectContaining({ marca: "B", numero_serie: "S2" }),
    ]);
    expect(onFechar).toHaveBeenCalled();
  });

  it("recusa número de série repetido entre as unidades", async () => {
    const onEnviar = vi.fn();
    render(
      <EquipamentosInstrumentoFormEntrega
        itens={[item({ quantidade_planejada: 3, quantidade_entregue: 0 })]}
        apenasItemId={1}
        onEnviar={onEnviar}
        onFechar={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Adicionar unidade" }),
    );
    for (const campo of screen.getAllByLabelText("Nº de série")) {
      await userEvent.type(campo, "IGUAL");
    }
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar entrega" }),
    );
    expect(
      await screen.findByText("Número de série repetido."),
    ).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });
});
