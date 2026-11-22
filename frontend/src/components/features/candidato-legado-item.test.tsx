import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { CandidatoLegadoItem } from "./candidato-legado-item";

const base: CandidatoLegado = {
  id: 1,
  numero: "7AAIOY",
  id_proposta: "1001",
  captura_id: 2,
  versao: 0,
  itens: [],
  situacao: "novo",
  confirmacao_portal: "nao_encontrado",
  data_publicacao: null,
  origem: "siconv_oficial",
  descoberto_em: "2026-11-12T10:00:00Z",
  verificado_em: "2026-11-21T10:00:00Z",
  valor_global: null,
  municipio: null,
  uf: null,
  data_instrumento: null,
  componentes: [],
  evidencias: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

it("mostra Portal pendente com a idade em dias", () => {
  render(<CandidatoLegadoItem candidato={base} />);
  expect(screen.getByText("Portal pendente · há 10 dias")).toBeVisible();
});

it("não mostra o selo quando o Portal confirmou ou a análise já acabou", () => {
  const { rerender } = render(
    <CandidatoLegadoItem
      candidato={{ ...base, confirmacao_portal: "confirmado" }}
    />,
  );
  expect(screen.queryByText(/Portal pendente/)).not.toBeInTheDocument();
  rerender(
    <CandidatoLegadoItem candidato={{ ...base, situacao: "rejeitado" }} />,
  );
  expect(screen.queryByText(/Portal pendente/)).not.toBeInTheDocument();
});
