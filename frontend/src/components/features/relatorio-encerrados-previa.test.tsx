import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RelatorioEncerradosPrevia } from "./relatorio-encerrados-previa";
import type { RegistroEncerrado } from "@/services/relatorios-encerrados";

const registro: RegistroEncerrado = {
  chave: "Convênio:999001",
  numero: "999001",
  nome: "Instituição sintética",
  tipo: "Convênio",
  uf: null,
  municipio: null,
  cnes: null,
  valor_global: null,
  motivo: "Conclusão interna sem data",
  evidencia: "Evento fase_concluido ativo sem data",
  data_conclusao: null,
  situacao_carteira: null,
  situacao_monitoramento: null,
  situacao_oficial: null,
  pendencia: true,
};

it("exibe motivo e evidência sem esconder a pendência e permite paginar", async () => {
  // Arrange
  const pagina = vi.fn();
  render(
    <RelatorioEncerradosPrevia
      titulo="Pendências"
      itens={[registro]}
      total={21}
      pagina={1}
      onPaginaChange={pagina}
    />,
  );
  // Act
  await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  // Assert
  expect(screen.getByText(registro.motivo)).toBeInTheDocument();
  expect(screen.getByText(registro.evidencia)).toBeInTheDocument();
  expect(screen.getByText(/Município não informado/)).toBeInTheDocument();
  expect(pagina).toHaveBeenCalledWith(2);
});

it("apresenta recorte vazio sem inventar encerrados", () => {
  // Arrange / Act
  render(
    <RelatorioEncerradosPrevia
      titulo="Encerrados"
      itens={[]}
      total={0}
      pagina={1}
      onPaginaChange={vi.fn()}
    />,
  );
  // Assert
  expect(
    screen.getByText("Nenhum registro neste recorte."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();
});
