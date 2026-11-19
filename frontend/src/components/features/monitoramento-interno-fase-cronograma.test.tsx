import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarMarcosInteracao } from "@/test-fixtures/monitoramento-interacoes";
import { criarEventoTeste } from "@/test-fixtures/monitoramento-hooks";
import { MonitoramentoInternoCronograma } from "./monitoramento-interno-fase-cronograma";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const marcos = criarMarcosInteracao();

describe("fase e cronograma do monitoramento", () => {
  it("escolhe o evento vigente do cronograma mesmo com entrada antiga primeiro", () => {
    {
      const marcoId = 2;
      // Arrange
      const antigo = criarEventoTeste({
        id: 9,
        marco_id: marcoId,
        data_ocorrencia: "2026-10-01",
        data_prevista: null,
        numero_documento: "ANTIGO",
        data_validade: "2026-10-19",
        status_regulatorio: "Pendente",
      });
      const novo = criarEventoTeste({
        ...antigo,
        id: 10,
        data_ocorrencia: "2026-10-20",
        numero_documento: "ATUAL",
        data_validade: "2026-10-21",
        status_regulatorio: "Deferido",
      });
      // Act
      render(
        <MonitoramentoInternoCronograma
          cronogramaFisico={[marcos[1]]}
          eventosPorMarco={new Map([[marcoId, [antigo, novo]]])}
          multiploEquipamento={false}
        />,
      );
      // Assert
      expect(screen.getByText("20/10/2026")).toBeInTheDocument();
      expect(screen.queryByText("01/10/2026")).not.toBeInTheDocument();
    }
  });

  it("mostra todos os eventos ativos quando há múltiplos equipamentos", () => {
    // Arrange
    const evs = [
      criarEventoTeste({
        id: 9,
        marco_id: 2,
        data_ocorrencia: "2026-10-01",
        observacao: "Unidade física A",
      }),
      criarEventoTeste({
        id: 10,
        marco_id: 2,
        data_ocorrencia: null,
        data_prevista: "2026-10-21",
        observacao: "Unidade física B",
      }),
    ];
    // Act
    render(
      <MonitoramentoInternoCronograma
        cronogramaFisico={[marcos[1]]}
        eventosPorMarco={new Map([[2, evs]])}
        multiploEquipamento
      />,
    );
    // Assert
    expect(screen.getByText(/Unidade física A/)).toBeInTheDocument();
    expect(screen.getByText(/Unidade física B/)).toBeInTheDocument();
    expect(screen.getByText(/prev. 21\/10\/2026/)).toBeInTheDocument();
  });

  it("mostra o cartão de documentos recebido ao lado do cronograma", () => {
    render(
      <MonitoramentoInternoCronograma
        cronogramaFisico={[]}
        documentos={<div>Cartão de documentos</div>}
        eventosPorMarco={new Map()}
        multiploEquipamento={false}
      />,
    );
    expect(screen.getByText("Cartão de documentos")).toBeInTheDocument();
  });

  it("marcos sem evento ficam recolhidos em 'Sem registro', sem linha vazia", () => {
    // Arrange / Act
    render(
      <MonitoramentoInternoCronograma
        cronogramaFisico={[marcos[1]]}
        eventosPorMarco={new Map()}
        multiploEquipamento={false}
      />,
    );
    // Assert
    expect(screen.getByText("Previsão de inauguração")).toBeInTheDocument();
    expect(screen.getByText(/Sem registro \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Nenhum marco registrado.")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
