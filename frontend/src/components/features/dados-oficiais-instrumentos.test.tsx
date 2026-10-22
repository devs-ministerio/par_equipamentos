import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DadosOficiaisInstrumentos } from "./dados-oficiais-instrumentos";

describe("disponibilidade dos dados oficiais para classificação", () => {
  it("não mostra resultado enquanto a consulta está pendente", () => {
    render(
      <DadosOficiaisInstrumentos carregando>
        <p>Instrumento não monitorado</p>
      </DadosOficiaisInstrumentos>,
    );
    expect(
      screen.getByRole("status", { name: "Carregando instrumentos" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Instrumento não monitorado"),
    ).not.toBeInTheDocument();
  });

  it("falha não vira resultado Não e oferece nova consulta", () => {
    const refazerConsulta = vi.fn();
    render(
      <DadosOficiaisInstrumentos
        carregando={false}
        erro="Monitoramento indisponível"
        onRetry={refazerConsulta}
      >
        <p>Instrumento não monitorado</p>
      </DadosOficiaisInstrumentos>,
    );
    expect(screen.getByText("Monitoramento indisponível")).toBeInTheDocument();
    expect(
      screen.queryByText("Instrumento não monitorado"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refazerConsulta).toHaveBeenCalledTimes(1);
  });

  it("exibe os resultados depois da consulta bem-sucedida", () => {
    const { rerender } = render(
      <DadosOficiaisInstrumentos carregando erro="Indisponível">
        <p>Resultado confirmado</p>
      </DadosOficiaisInstrumentos>,
    );
    rerender(
      <DadosOficiaisInstrumentos carregando={false}>
        <p>Resultado confirmado</p>
      </DadosOficiaisInstrumentos>,
    );
    expect(screen.getByText("Resultado confirmado")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
