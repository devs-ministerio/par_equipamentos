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
  data_referencia: null,
  origem_data: null,
  equipamentos: "",
  quantidade: null,
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

it("apresenta recorte vazio sem inventar concluídos", () => {
  // Arrange / Act
  render(
    <RelatorioEncerradosPrevia
      titulo="Concluídos"
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

it("apresenta equipamento, valor e data de conclusão, e identifica o fim da vigência", () => {
  // Arrange
  const concluido: RegistroEncerrado = {
    ...registro,
    chave: "Convênio:999002",
    numero: "999002",
    pendencia: false,
    motivo: "Prestação de contas concluída",
    uf: "BA",
    municipio: "Salvador",
    valor_global: 6400000,
    equipamentos: "Acelerador Linear; Mamógrafo",
    quantidade: 3,
    cnes: "0000434",
    data_referencia: "2025-10-05",
    origem_data: "Fim da vigência",
  };
  const noMonitoramento: RegistroEncerrado = {
    ...concluido,
    chave: "Convênio:999003",
    numero: "999003",
    data_referencia: "2024-06-30",
    origem_data: "Conclusão no monitoramento",
    equipamentos: "",
  };
  // Act
  render(
    <RelatorioEncerradosPrevia
      titulo="Concluídos"
      itens={[concluido, noMonitoramento]}
      total={2}
      pagina={1}
      onPaginaChange={vi.fn()}
    />,
  );
  // Assert
  expect(screen.getByText("Acelerador Linear; Mamógrafo")).toBeInTheDocument();
  expect(screen.getByText("Não identificado")).toBeInTheDocument();
  // número, CNES e quantidade em itens próprios
  expect(screen.getByText(/Nº 999002 · CNES 0000434/)).toBeInTheDocument();
  expect(
    screen.getAllByText(/Qtd\.:/).map((e) => e.parentElement?.textContent),
  ).toContain(" · Qtd.: 3");
  expect(screen.getAllByText(/R\$\s*6\.400\.000/)).toHaveLength(2);
  expect(
    screen.getByText(/05\/10\/2025 \(fim da vigência\)/),
  ).toBeInTheDocument();
  expect(screen.getByText(/30\/06\/2024/)).toBeInTheDocument();
  expect(screen.queryByText(/30\/06\/2024 \(fim da vigência\)/)).toBeNull();
  // a evidência técnica fica só nas pendências
  expect(screen.queryByText(registro.evidencia)).toBeNull();
});
