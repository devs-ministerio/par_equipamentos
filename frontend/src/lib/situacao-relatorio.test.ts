import { expect, it } from "vitest";
import {
  codificarSituacao,
  decodificarSituacao,
  opcoesSituacao,
} from "./situacao-relatorio";

it("ida e volta preserva a origem e o valor, mesmo com separador no texto", () => {
  const codigo = codificarSituacao("proposta", "Em análise | recurso");
  expect(decodificarSituacao(codigo)).toEqual({
    origem: "proposta",
    valor: "Em análise | recurso",
  });
  expect(decodificarSituacao(null)).toBeNull();
  expect(decodificarSituacao("sem-origem")).toBeNull();
});

it("agrupa por origem, ordena e omite origem sem valores", () => {
  const opcoes = opcoesSituacao({
    instrumento: ["Em execução", "Concluído", "Concluído"],
    monitoramento: [],
    proposta: ["Em análise"],
  });
  expect(opcoes.map((o) => [o.group, o.label])).toEqual([
    ["Instrumento", "Concluído"],
    ["Instrumento", "Em execução"],
    ["Proposta", "Em análise"],
  ]);
  expect(new Set(opcoes.map((o) => o.value)).size).toBe(3);
});
