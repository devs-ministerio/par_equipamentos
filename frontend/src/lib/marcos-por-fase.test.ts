import { describe, expect, it } from "vitest";
import { avisoMarcoIndisponivel } from "./marcos-por-fase";

describe("marcos por fase", () => {
  it.each([
    [
      "cronograma_inicio_fabricacao",
      "Aguardando repasse",
      "disponível após o repasse",
    ],
    ["cronograma_inicio_fabricacao", "Valor repassado", null],
    [
      "cronograma_chegada_porto",
      "Equipamento entregue",
      "não se lança mais nesta fase",
    ],
    ["cronograma_obra_inicio", "Acompanhamento iniciado", null],
    ["cronograma_obra_fim", "Pós-entrega", "não se lança mais nesta fase"],
    [
      "cronograma_instalacao_inicio",
      "Em aquisição",
      "disponível após a entrega",
    ],
    ["cronograma_instalacao_inicio", "Equipamento entregue", null],
    ["cronograma_treinamento", "Concluído", "acompanhamento concluído"],
    ["cronograma_previsao_inauguracao", "Concluído", null],
    ["cronograma_treinamento", undefined, null],
  ])("%s em %s", (codigo, fase, esperado) => {
    expect(avisoMarcoIndisponivel(codigo, fase)).toBe(esperado);
  });
});
