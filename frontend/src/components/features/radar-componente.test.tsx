import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepararHooksRadar,
  limparHooksRadar,
} from "@/test-fixtures/radar-hooks";
import { CandidatosLegados } from "./candidatos-legados";

afterEach(limparHooksRadar);

const componente = {
  id_programa: "53000",
  nome_programa:
    "REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - AMBULATORIO PARA DIAGNOSTICO EM ONCOLOGIA",
  componente:
    "REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - AMBULATORIO PARA DIAGNOSTICO EM ONCOLOGIA",
};

function montar(componentes: unknown) {
  const api = prepararHooksRadar();
  api.controle.pagina = {
    total: 1,
    novos: 1,
    itens: [{ ...api.controle.candidato, componentes }],
  };
  const view = render(<CandidatosLegados />, { wrapper: api.wrapper });
  return { ...view, client: api.client };
}

describe("componente oficial no card do Radar", () => {
  it("preserva o componente pelo contrato HTTP e o apresenta no lugar dos metadados antigos", async () => {
    // Arrange / Act: hook, service, Zod e UI reais.
    const { client, unmount } = montar([componente]);
    try {
      await screen.findByRole("heading", { name: "Convênio 999001" });
      // Assert
      expect(screen.getByText(componente.componente)).toBeVisible();
      expect(screen.getByText("Proposta 111001")).not.toBeVisible();
      expect(screen.queryByText("1 evidência")).not.toBeInTheDocument();
    } finally {
      unmount();
      client.clear();
    }
  });

  it("não descarta silenciosamente um componente inválido", async () => {
    const { client, unmount } = montar([{ ...componente, id_programa: false }]);
    try {
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Convênio 999001" }),
      ).not.toBeInTheDocument();
    } finally {
      unmount();
      client.clear();
    }
  });
});
