import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import type { ItemParaRevisao } from "@/services/classificacao-itens";
import { ClassificacaoItemCard } from "./classificacao-item-card";

const item: ItemParaRevisao = {
  id: 7,
  convenio_numero: "877501",
  instrumento_nr_convenio: null,
  descricao: "Tomógrafo computadorizado sem número de canais",
  valor_total: 873600,
  tipo_lancamento: "aquisicao",
  codigo_item: null,
  familia: null,
  motivo: "tomógrafo sem número de canais ou cortes: verificar",
};

describe("fila de revisão de itens", () => {
  it("mostra o texto, a sugestão e o motivo, e confirma a sugestão", async () => {
    const onDecidir = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ul>
        <ClassificacaoItemCard item={item} onDecidir={onDecidir} />
      </ul>,
    );
    expect(screen.getByText(/Tomógrafo computadorizado/)).toBeInTheDocument();
    expect(screen.getByText(/verificar/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar sugestão" }),
    );
    await waitFor(() =>
      expect(onDecidir).toHaveBeenCalledWith({
        acao: "confirmar",
        observacao: undefined,
      }),
    );
  });

  it("corrige com tipo e código RENEM", async () => {
    const onDecidir = vi.fn().mockResolvedValue(undefined);
    render(
      <ul>
        <ClassificacaoItemCard item={item} onDecidir={onDecidir} />
      </ul>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Corrigir" }));
    await userEvent.type(screen.getByLabelText("Código RENEM"), "011804");
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar correção" }),
    );
    await waitFor(() =>
      expect(onDecidir).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: "corrigir",
          tipo_lancamento: "aquisicao",
          codigo_item: "011804",
        }),
      ),
    );
  });

  it("item com mais de um equipamento não pode ser confirmado", () => {
    render(
      <ul>
        <ClassificacaoItemCard
          item={{ ...item, tipo_lancamento: "multiplo" }}
          onDecidir={vi.fn()}
        />
      </ul>,
    );
    expect(
      screen.getByRole("button", { name: "Confirmar sugestão" }),
    ).toBeDisabled();
  });

  it("mostra o erro do servidor e permite tentar de novo", async () => {
    const onDecidir = vi.fn().mockRejectedValue(new Error("falhou"));
    render(
      <ul>
        <ClassificacaoItemCard item={item} onDecidir={onDecidir} />
      </ul>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Não é equipamento" }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Não é equipamento" }),
    ).toBeEnabled();
  });
});
