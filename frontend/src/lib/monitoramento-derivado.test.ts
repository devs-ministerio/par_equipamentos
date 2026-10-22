import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InstrumentoTimeline,
  EventoMarco,
} from "@/services/monitoramento-instrumentos";
import {
  criarAcaoTeste,
  criarEventoTeste,
  criarInstrumentoTeste,
} from "@/test-fixtures/monitoramento-hooks";
import { criarMarcosInteracao } from "@/test-fixtures/monitoramento-interacoes";
import { derivarMonitoramentoInterno } from "./monitoramento-derivado";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function timeline(eventos: EventoMarco[] = []): InstrumentoTimeline {
  return {
    instrumento: criarInstrumentoTeste(),
    eventos,
    ao_vivo: { disponivel: false, valor_suspeito: false },
  };
}

describe("derivação do monitoramento sem I/O", () => {
  it("não inventa fase, datas, licença ou equipamento sem dados", () => {
    // Arrange / Act
    const d = derivarMonitoramentoInterno([], timeline(), undefined);
    // Assert
    expect(d).toMatchObject({
      faseAtual: undefined,
      pctAtual: 0,
      dataInauguracao: null,
      inaugurado: false,
      diasInauguracao: null,
      eventoLicenca: null,
      validadeLicenca: null,
      equipamentoFisico: null,
      acoesAbertas: [],
      acoesAtrasadas: [],
    });
    expect(d.eventosPorMarco.size).toBe(0);
  });

  it("usa a fase de maior ordem, não o último evento de qualquer grupo", () => {
    // Arrange
    const eventos = [
      criarEventoTeste({ marco_id: 4 }),
      criarEventoTeste({
        id: 30,
        marco_id: 1,
        created_at: "2026-10-20T12:00:00Z",
      }),
      criarEventoTeste({ id: 31, marco_id: 999 }),
    ];
    // Act
    const d = derivarMonitoramentoInterno(
      criarMarcosInteracao().reverse(),
      timeline(eventos),
      [],
    );
    // Assert
    expect(d.fasesGerais.map((m) => m.id)).toEqual([1, 4]);
    expect(d.faseAtual?.id).toBe(4);
    expect(d.pctAtual).toBe(1);
  });

  it.each([2, 3])(
    "evento do grupo %s não muda a fase geral sozinho",
    (marcoId) => {
      // Arrange / Act
      const d = derivarMonitoramentoInterno(
        criarMarcosInteracao(),
        timeline([criarEventoTeste({ marco_id: marcoId })]),
        [],
      );
      // Assert
      expect(d.faseAtual).toBeUndefined();
      expect(d.pctAtual).toBe(0);
    },
  );

  it.each([2, 3])(
    "desempata marco %s pelo ID numérico independentemente da ordem",
    (marcoId) => {
      // Arrange
      const antigo = criarEventoTeste({
        id: 9,
        marco_id: marcoId,
        created_at: "2026-10-19T10:00:00Z",
        data_ocorrencia: null,
        data_prevista: "2026-10-21",
        data_validade: "2026-10-21",
      });
      const atual = criarEventoTeste({
        ...antigo,
        id: 10,
        data_prevista: "2026-11-20",
        data_validade: "2026-11-20",
      });
      // Act / Assert
      for (const eventos of [
        [antigo, atual],
        [atual, antigo],
      ]) {
        const d = derivarMonitoramentoInterno(
          criarMarcosInteracao(),
          timeline(eventos),
          [],
        );
        expect(
          (marcoId === 2 ? d.eventoInauguracao : d.eventoLicenca)?.id,
        ).toBe(10);
        expect(marcoId === 2 ? d.diasInauguracao : d.validadeLicenca).toBe(31);
      }
    },
  );

  it("criação mais recente prevalece sobre ID ou previsão com data maior", () => {
    // Arrange
    const velho = criarEventoTeste({
      id: 99,
      marco_id: 2,
      created_at: "2026-10-18T10:00:00Z",
      data_ocorrencia: null,
      data_prevista: "2030-01-01",
    });
    const novo = criarEventoTeste({
      id: 10,
      marco_id: 2,
      created_at: "2026-10-19T10:00:00Z",
      data_ocorrencia: null,
      data_prevista: "2026-10-21",
    });
    // Act
    const d = derivarMonitoramentoInterno(
      criarMarcosInteracao(),
      timeline([velho, novo]),
      [],
    );
    // Assert
    expect(d.eventoInauguracao?.id).toBe(10);
    expect(d.dataInauguracao).toBe("2026-10-21");
    expect(d.diasInauguracao).toBe(1);
  });

  it("preserva seleção da licença mais recente com validade preenchida", () => {
    // Arrange
    const comData = criarEventoTeste({
      id: 9,
      marco_id: 3,
      data_validade: "2026-10-21",
    });
    const semData = criarEventoTeste({
      id: 10,
      marco_id: 3,
      data_validade: null,
    });
    // Act
    const d = derivarMonitoramentoInterno(
      criarMarcosInteracao(),
      timeline([semData, comData]),
      [],
    );
    // Assert: esta seleção específica já é a regra do resumo no backend.
    expect(d.eventoLicenca?.id).toBe(9);
    expect(d.validadeLicenca).toBe(1);
  });

  it("usa ocorrência real antes da previsão no registro vigente e não conta atraso de fato realizado", () => {
    // Arrange
    const ev = criarEventoTeste({
      marco_id: 2,
      data_ocorrencia: "2026-10-19",
      data_prevista: "2026-10-01",
    });
    // Act
    const d = derivarMonitoramentoInterno(
      criarMarcosInteracao(),
      timeline([ev]),
      [],
    );
    // Assert
    expect(d.inaugurado).toBe(true);
    expect(d.dataInauguracao).toBe("2026-10-19");
    expect(d.diasInauguracao).toBeNull();
  });

  it("registro sem data não vira previsão nem dia zero", () => {
    // Arrange / Act
    const d = derivarMonitoramentoInterno(
      criarMarcosInteracao(),
      timeline([
        criarEventoTeste({
          marco_id: 2,
          data_ocorrencia: null,
          data_prevista: null,
        }),
      ]),
      [],
    );
    // Assert
    expect(d.dataInauguracao).toBeNull();
    expect(d.diasInauguracao).toBeNull();
  });

  it("separa tarefas pendentes/atrasadas sem contar concluídas nem sem prazo", () => {
    // Arrange
    const acoes = [
      criarAcaoTeste({ id: 1, data_prevista: "2026-10-19" }),
      criarAcaoTeste({ id: 2, data_prevista: "2026-10-20" }),
      criarAcaoTeste({ id: 3, data_prevista: null }),
      criarAcaoTeste({
        id: 4,
        data_prevista: "2026-10-18",
        data_conclusao: "2026-10-19",
      }),
    ];
    // Act
    const d = derivarMonitoramentoInterno(
      criarMarcosInteracao(),
      timeline(),
      acoes,
    );
    // Assert
    expect(d.acoesAbertas.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(d.acoesAtrasadas.map((a) => a.id)).toEqual([1]);
  });

  it.each([
    [null, null, null],
    ["Marca sintética", null, "Marca sintética"],
    [null, "Modelo sintético", "Modelo sintético"],
    ["Marca", "Modelo", "Marca Modelo"],
  ])(
    "equipamento físico %s/%s não usa descrição planejada como marca",
    (marca, modelo, esperado) => {
      // Arrange
      const t = timeline();
      t.instrumento = criarInstrumentoTeste({
        equipamento_marca: marca,
        equipamento_modelo: modelo,
        equipamento_descricao: "Planejado, não entregue",
      });
      // Act / Assert
      expect(
        derivarMonitoramentoInterno(criarMarcosInteracao(), t, [])
          .equipamentoFisico,
      ).toBe(esperado);
    },
  );

  it("não reordena nem altera marcos, ações ou eventos recebidos", () => {
    // Arrange
    const marcos = criarMarcosInteracao().reverse();
    const t = timeline([
      criarEventoTeste({ id: 10 }),
      criarEventoTeste({ id: 9 }),
    ]);
    const acoes = [criarAcaoTeste()];
    const antes = structuredClone({ marcos, t, acoes });
    // Act
    derivarMonitoramentoInterno(marcos, t, acoes);
    // Assert
    expect({ marcos, t, acoes }).toEqual(antes);
  });
});
