/** Derivação pura (sem I/O) do que MonitoramentoInterno.tsx precisa exibir
 * a partir de marcos + timeline + ações -- extraído do componente (era
 * tudo calculado inline no corpo da função) pra função testável e
 * reaproveitável pelos subcomponentes depois do split (Seção 6 da
 * migração). Mesma lógica de antes, char por char, só organizada. */
import type { AcaoMonitoramento } from "@/services/monitoramento-acoes";
import type {
  EventoMarco,
  InstrumentoTimeline,
} from "@/services/monitoramento-instrumentos";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import { diasAte } from "./monitoramento-format";

function eventoMaisRecente(eventos: EventoMarco[]): EventoMarco | null {
  return eventos.reduce<EventoMarco | null>(
    (maisRecente, evento) =>
      !maisRecente ||
      `${evento.created_at}-${evento.id}` >
        `${maisRecente.created_at}-${maisRecente.id}`
        ? evento
        : maisRecente,
    null,
  );
}

export function derivarMonitoramentoInterno(
  marcos: MarcoCatalogo[],
  timeline: InstrumentoTimeline,
  acoes: AcaoMonitoramento[] | undefined,
) {
  const fasesGerais = marcos
    .filter((m) => m.grupo === "fase_geral")
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  // Fase atual = marco de fase_geral de maior ordem com evento lancado.
  const eventosPorMarco = new Map<number, EventoMarco[]>();
  for (const ev of timeline.eventos) {
    if (!eventosPorMarco.has(ev.marco_id)) eventosPorMarco.set(ev.marco_id, []);
    eventosPorMarco.get(ev.marco_id)!.push(ev);
  }
  const faseAtual = [...fasesGerais]
    .reverse()
    .find((m) => eventosPorMarco.has(m.id));
  const pctAtual = faseAtual?.execucao_fisica_pct_referencia ?? 0;

  const cronogramaFisico = marcos.filter(
    (m) => m.grupo === "cronograma_fisico",
  );
  const regulatorio = marcos.filter((m) => m.grupo === "regulatorio");

  // Contador de validade -- so faz sentido pra licenca de operacao (e a
  // unica que de fato "vence" nesse catalogo; matricula/SCRA nao tem
  // prazo de renovacao no mesmo sentido). Evento mais recente com
  // data_validade preenchida.
  const marcoLicenca = regulatorio.find(
    (m) => m.codigo === "regulatorio_licenca_operacao",
  );
  const eventoLicenca = marcoLicenca
    ? eventoMaisRecente(
        (eventosPorMarco.get(marcoLicenca.id) ?? []).filter((evento) =>
          Boolean(evento.data_validade),
        ),
      )
    : null;

  // Previsao de inauguracao -- destaque pedido pelo usuario 2026-09-09
  // ("também é um dado que se destaca pra nós"). Se ja tem data_ocorrencia
  // no marco, o equipamento ja foi inaugurado (fato consumado); senao usa
  // data_prevista (previsao ainda em aberto) pra contar dias.
  const marcoInauguracao = cronogramaFisico.find(
    (m) => m.codigo === "cronograma_previsao_inauguracao",
  );
  const eventoInauguracao = marcoInauguracao
    ? eventoMaisRecente(eventosPorMarco.get(marcoInauguracao.id) ?? [])
    : null;
  const inaugurado = !!eventoInauguracao?.data_ocorrencia;
  const dataInauguracao =
    eventoInauguracao?.data_ocorrencia ||
    eventoInauguracao?.data_prevista ||
    null;
  const diasInauguracao = !inaugurado ? diasAte(dataInauguracao) : null;

  const acoesAbertas = (acoes ?? []).filter((a) => !a.data_conclusao);
  const acoesAtrasadas = acoesAbertas.filter((a) => {
    const dias = diasAte(a.data_prevista);
    return dias !== null && dias < 0;
  });

  const inst = timeline.instrumento;
  const equipamentoFisico =
    [inst.equipamento_marca, inst.equipamento_modelo]
      .filter(Boolean)
      .join(" ") || null;
  const validadeLicenca = eventoLicenca?.data_validade
    ? diasAte(eventoLicenca.data_validade)
    : null;

  return {
    fasesGerais,
    eventosPorMarco,
    faseAtual,
    pctAtual,
    cronogramaFisico,
    regulatorio,
    marcoLicenca,
    eventoLicenca,
    marcoInauguracao,
    eventoInauguracao,
    inaugurado,
    dataInauguracao,
    diasInauguracao,
    acoesAbertas,
    acoesAtrasadas,
    equipamentoFisico,
    validadeLicenca,
  };
}
