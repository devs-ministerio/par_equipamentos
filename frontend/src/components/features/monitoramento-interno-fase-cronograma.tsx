/** Seções "Fase geral" (stepper) + "Cronograma" e o cartão "Documentos"
 * recebido por `documentos` -- extraído de MonitoramentoInterno.tsx. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EventoMarco } from "@/services/monitoramento-instrumentos";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import { SecaoOperacional } from "./monitoramento-ui";
import { fmtData } from "@/lib/monitoramento-format";
import { eventoMaisRecente } from "@/lib/monitoramento-eventos";

function eventosVisiveis(
  eventos: EventoMarco[],
  multiplo: boolean,
): EventoMarco[] {
  if (multiplo) return eventos;
  const atual = eventoMaisRecente(eventos);
  return atual ? [atual] : [];
}

function Ponto({
  realizado,
  previsto,
}: {
  realizado: boolean;
  previsto: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-[3px] size-2.5 shrink-0 rounded-full border-2",
        realizado
          ? "border-success bg-success"
          : previsto
            ? "border-warning bg-card"
            : "border-border bg-card",
      )}
    />
  );
}

/** Marcos sem registro ficam recolhidos: a lista mostra o que aconteceu ou está previsto. */
function MarcosSemRegistro({ marcos }: { marcos: MarcoCatalogo[] }) {
  if (marcos.length === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11.5px] font-semibold text-muted-foreground">
        Sem registro ({marcos.length})
      </summary>
      <ul className="m-0 mt-1.5 grid list-none gap-1 p-0 text-[12px] text-muted-foreground">
        {marcos.map((m) => (
          <li key={m.id}>{m.rotulo}</li>
        ))}
      </ul>
    </details>
  );
}

export function MonitoramentoInternoCronograma({
  cronogramaFisico,
  documentos,
  acao,
  eventosPorMarco,
  multiploEquipamento,
  entregaPorItem = false,
}: {
  cronogramaFisico: MarcoCatalogo[];
  /** Cartão de documentos exibido ao lado do cronograma. */
  documentos?: ReactNode;
  /** Botões de lançamento (evento e ação) no cabeçalho do cartão. */
  acao?: ReactNode;
  eventosPorMarco: Map<number, EventoMarco[]>;
  /** Mostra TODOS os eventos ativos do marco em vez de só o mais recente
   * (Plan Mode monitoramento-evolucao 2026-09-19, decisão do usuário) --
   * só faz sentido quando o convênio financia mais de 1 equipamento (ex.
   * convênio 947527, 2 aceleradores lineares com datas diferentes cada);
   * pro caso normal (1 equipamento), múltiplos eventos ativos do mesmo
   * marco continuam sendo tratados como histórico -- só o mais recente
   * importa. */
  multiploEquipamento: boolean;
  /** Já há entrega registrada por item: o marco antigo de entrega some (duas datas confundiriam). */
  entregaPorItem?: boolean;
}) {
  const visiveis = (m: MarcoCatalogo) =>
    eventosVisiveis(eventosPorMarco.get(m.id) ?? [], multiploEquipamento);
  const marcosVigentes = entregaPorItem
    ? cronogramaFisico.filter((m) => m.codigo !== "cronograma_entrega")
    : cronogramaFisico;
  const fisicoComRegistro = marcosVigentes.filter((m) => visiveis(m).length);

  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
      <SecaoOperacional titulo="Cronograma" cartao acao={acao}>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {fisicoComRegistro.map((m) => (
            <li key={m.id} className="flex gap-2.5 text-[12.5px]">
              <Ponto
                realizado={visiveis(m).some((e) => e.data_ocorrencia)}
                previsto
              />
              <span className="min-w-0 flex-1">
                {m.codigo === "cronograma_previsao_inauguracao" &&
                visiveis(m).some((e) => e.data_ocorrencia)
                  ? "Inauguração"
                  : m.rotulo}
              </span>
              <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                {visiveis(m).map((ev) => (
                  <span key={ev.id} className="block">
                    {fmtData(ev.data_ocorrencia) !== "—"
                      ? fmtData(ev.data_ocorrencia)
                      : `prev. ${fmtData(ev.data_prevista)}`}
                    {multiploEquipamento && ev.observacao && (
                      <span className="italic"> · {ev.observacao}</span>
                    )}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {fisicoComRegistro.length === 0 && (
          <p className="m-0 text-[12.5px] text-muted-foreground">
            Nenhum marco registrado.
          </p>
        )}
        <MarcosSemRegistro
          // Só o cronograma vigente (com ordem): marcos antigos e a inauguração (tratada à parte) não entram.
          marcos={marcosVigentes.filter(
            (m) => m.ordem !== null && !visiveis(m).length,
          )}
        />
      </SecaoOperacional>

      {documentos}
    </div>
  );
}
