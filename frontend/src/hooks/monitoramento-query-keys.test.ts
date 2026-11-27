import { describe, expect, it } from "vitest";
import { monitoramentoKeys } from "@/hooks/monitoramento-query-keys";

describe("monitoramentoKeys", () => {
  it("usa valores padrão quando o argumento é omitido", () => {
    expect(monitoramentoKeys.acoesDoInstrumento("1")).toEqual([
      "monitoramento",
      "acoes",
      "instrumento",
      "1",
      false,
    ]);
    expect(monitoramentoKeys.acoes()).toEqual([
      "monitoramento",
      "acoes",
      "todas",
    ]);
    expect(monitoramentoKeys.notificacoes()).toEqual(["notificacoes", "todas"]);
    expect(monitoramentoKeys.usuarios()).toEqual(["usuarios", "todos"]);
    expect(monitoramentoKeys.auditoria()).toEqual(["auditoria", "todos"]);
  });

  it("inclui o argumento quando informado", () => {
    expect(monitoramentoKeys.acoesDoInstrumento("1", true)[4]).toBe(true);
    expect(monitoramentoKeys.acoes(false)[2]).toBe(false);
    expect(monitoramentoKeys.notificacoes(true)[1]).toBe(true);
    expect(monitoramentoKeys.usuarios({ papel: "admin" })[1]).toEqual({
      papel: "admin",
    });
    expect(monitoramentoKeys.auditoria({ q: "x" })[1]).toEqual({ q: "x" });
    expect(monitoramentoKeys.instrumento("9")).toEqual([
      "monitoramento",
      "instrumento",
      "9",
    ]);
    expect(monitoramentoKeys.propostasCandidatas()).toEqual([
      "propostas-candidatas",
    ]);
  });
});
