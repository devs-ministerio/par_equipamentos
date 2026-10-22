import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarMarcosInteracao } from "@/test-fixtures/monitoramento-interacoes";
import { criarEventoTeste } from "@/test-fixtures/monitoramento-hooks";
import {
  MonitoramentoInternoCronograma,
  MonitoramentoInternoFaseGeral,
} from "./monitoramento-interno-fase-cronograma";

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
  it("mostra fase e percentual de referência recebidos, sem inventar medição física", () => {
    // Arrange / Act
    render(
      <MonitoramentoInternoFaseGeral
        fasesGerais={[marcos[0], marcos[3]]}
        faseAtual={marcos[0]}
        pctAtual={0.5}
      />,
    );
    // Assert
    expect(screen.getByText("Contratado — 50%")).toBeInTheDocument();
  });

  it("mantém não iniciado sem evento de fase geral", () => {
    // Arrange / Act
    render(
      <MonitoramentoInternoFaseGeral
        fasesGerais={[marcos[0], marcos[3]]}
        faseAtual={undefined}
        pctAtual={0}
      />,
    );
    // Assert
    expect(screen.getByText("Não iniciado — 0%")).toBeInTheDocument();
  });

  it.each([2, 3])(
    "escolhe evento vigente do marco %s mesmo com entrada antiga primeiro",
    (marcoId) => {
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
          regulatorio={[marcos[2]]}
          eventosPorMarco={new Map([[marcoId, [antigo, novo]]])}
          multiploEquipamento={false}
        />,
      );
      // Assert
      if (marcoId === 2) {
        expect(screen.getByText("20/10/2026")).toBeInTheDocument();
        expect(screen.queryByText("01/10/2026")).not.toBeInTheDocument();
      } else {
        expect(screen.getByText(/ATUAL/)).toBeInTheDocument();
        expect(screen.getByText("Deferido")).toBeInTheDocument();
        expect(screen.getByText(/Vence em 1 dia/)).toBeInTheDocument();
        expect(screen.queryByText(/ANTIGO/)).not.toBeInTheDocument();
      }
    },
  );

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
        regulatorio={[]}
        eventosPorMarco={new Map([[2, evs]])}
        multiploEquipamento
      />,
    );
    // Assert
    expect(screen.getByText(/Unidade física A/)).toBeInTheDocument();
    expect(screen.getByText(/Unidade física B/)).toBeInTheDocument();
    expect(screen.getByText(/prev. 21\/10\/2026/)).toBeInTheDocument();
  });

  it.each(["2026-10-19", "2026-10-20", null])(
    "licença com validade %s mostra prazo ou ausência sem inventar documento",
    (validade) => {
      // Arrange
      const ev = criarEventoTeste({
        marco_id: 3,
        numero_documento: null,
        status_regulatorio: null,
        data_ocorrencia: null,
        data_validade: validade,
      });
      // Act
      render(
        <MonitoramentoInternoCronograma
          cronogramaFisico={[]}
          regulatorio={[marcos[2]]}
          eventosPorMarco={new Map([[3, [ev]]])}
          multiploEquipamento={false}
        />,
      );
      // Assert
      if (validade === "2026-10-19")
        expect(screen.getByText(/Vencida há 1 dia/)).toBeInTheDocument();
      else if (validade)
        expect(screen.getByText(/Vence em 0 dia/)).toBeInTheDocument();
      else expect(screen.queryByText(/Vence|Vencida/)).not.toBeInTheDocument();
      expect(screen.queryByText(/nº|Emitida em/)).not.toBeInTheDocument();
    },
  );

  it("mostra marcos do catálogo sem datas quando não há eventos", () => {
    // Arrange / Act
    render(
      <MonitoramentoInternoCronograma
        cronogramaFisico={[marcos[1]]}
        regulatorio={[marcos[2]]}
        eventosPorMarco={new Map()}
        multiploEquipamento={false}
      />,
    );
    // Assert
    expect(screen.getByText("Previsão de inauguração")).toBeInTheDocument();
    expect(screen.getByText("Licença de operação")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
