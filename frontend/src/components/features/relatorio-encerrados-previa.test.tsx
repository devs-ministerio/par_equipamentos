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
  data_final_vigencia: null,
  conclusao_fisica: "Não registrada",
  situacao_administrativa: null,
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

it("apresenta equipamento, valor e data de conclusão, com o fim da vigência separado", () => {
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
    data_referencia: null,
    origem_data: null,
    data_final_vigencia: "2025-10-05",
  };
  const noMonitoramento: RegistroEncerrado = {
    ...concluido,
    chave: "Convênio:999003",
    numero: "999003",
    data_referencia: "2024-06-30",
    origem_data: "Conclusão no monitoramento",
    data_final_vigencia: null,
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
  // D07: sem conclusão registrada, a data fica "Não informada" e a vigência aparece à parte, nunca como conclusão.
  expect(screen.getByText(/Não informada/)).toBeInTheDocument();
  expect(screen.getByText(/05\/10\/2025/)).toBeInTheDocument();
  expect(screen.getByText(/Fim da vigência:/)).toBeInTheDocument();
  expect(screen.getByText(/30\/06\/2024/)).toBeInTheDocument();
  expect(screen.getAllByText(/Fim da vigência:/)).toHaveLength(1);
  // a evidência técnica fica só nas pendências
  expect(screen.queryByText(registro.evidencia)).toBeNull();
});

it("mostra conclusão física e situação administrativa como informações separadas (D06)", () => {
  render(
    <RelatorioEncerradosPrevia
      titulo="Concluídos"
      itens={[
        {
          ...registro,
          chave: "Convênio:1",
          numero: "1",
          pendencia: false,
          motivo: "Concluído no monitoramento interno",
          conclusao_fisica: "Registrada",
          situacao_administrativa: "Divergência entre fontes",
        },
      ]}
      total={1}
      pagina={1}
      onPaginaChange={vi.fn()}
    />,
  );

  expect(
    screen.getByText(
      /Conclusão física: Registrada · Administrativo: Divergência entre fontes/,
    ),
  ).toBeInTheDocument();
});
