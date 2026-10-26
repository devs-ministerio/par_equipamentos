/** Seções "Fase geral" (stepper) + "Cronograma físico"/"Regulatório (CNEN)"
 * -- extraído de MonitoramentoInterno.tsx. */
import { cn } from "@/lib/utils";
import type { EventoMarco } from "@/services/monitoramento-instrumentos";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import { SecaoOperacional, StatusPill } from "./monitoramento-ui";
import { classeValidade } from "@/lib/monitoramento-status";
import { diasAte, fmtData } from "@/lib/monitoramento-format";
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
  regulatorio,
  eventosPorMarco,
  multiploEquipamento,
}: {
  cronogramaFisico: MarcoCatalogo[];
  regulatorio: MarcoCatalogo[];
  eventosPorMarco: Map<number, EventoMarco[]>;
  /** Mostra TODOS os eventos ativos do marco em vez de só o mais recente
   * (Plan Mode monitoramento-evolucao 2026-09-19, decisão do usuário) --
   * só faz sentido quando o convênio financia mais de 1 equipamento (ex.
   * convênio 947527, 2 aceleradores lineares com datas diferentes cada);
   * pro caso normal (1 equipamento), múltiplos eventos ativos do mesmo
   * marco continuam sendo tratados como histórico -- só o mais recente
   * importa. */
  multiploEquipamento: boolean;
}) {
  const visiveis = (m: MarcoCatalogo) =>
    eventosVisiveis(eventosPorMarco.get(m.id) ?? [], multiploEquipamento);
  const fisicoComRegistro = cronogramaFisico.filter((m) => visiveis(m).length);
  const regulatorioComRegistro = regulatorio.filter((m) => visiveis(m).length);

  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
      <SecaoOperacional titulo="Cronograma físico" cartao>
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {fisicoComRegistro.map((m) => (
            <li key={m.id} className="flex gap-2.5 text-[12.5px]">
              <Ponto
                realizado={visiveis(m).some((e) => e.data_ocorrencia)}
                previsto
              />
              <span className="min-w-0 flex-1">{m.rotulo}</span>
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
          marcos={cronogramaFisico.filter((m) => !visiveis(m).length)}
        />
      </SecaoOperacional>

      <SecaoOperacional titulo="Regulatório (CNEN)" cartao>
        <ul className="m-0 grid list-none gap-3 p-0">
          {regulatorioComRegistro.flatMap((m) =>
            visiveis(m).map((ev) => {
              const ehLicenca = m.codigo === "regulatorio_licenca_operacao";
              const dias = ehLicenca ? diasAte(ev.data_validade) : null;
              return (
                <li key={ev.id} className="flex gap-2.5 text-[12.5px]">
                  <Ponto realizado={Boolean(ev.data_ocorrencia)} previsto />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        {m.rotulo}
                        {ev.numero_documento
                          ? ` (nº ${ev.numero_documento})`
                          : ""}
                      </span>
                      {ev.status_regulatorio && (
                        <StatusPill texto={ev.status_regulatorio} />
                      )}
                    </div>
                    {ehLicenca && ev.data_ocorrencia && (
                      <div className="text-[11px] text-muted-foreground">
                        Emitida em {fmtData(ev.data_ocorrencia)}
                      </div>
                    )}
                    {dias !== null && (
                      <div
                        className={cn(
                          "text-[11px] font-semibold",
                          classeValidade(dias),
                        )}
                      >
                        {dias < 0
                          ? `Vencida há ${Math.abs(dias)} dia(s) (${fmtData(ev.data_validade)})`
                          : `Vence em ${dias} dia(s) (${fmtData(ev.data_validade)})`}
                      </div>
                    )}
                  </div>
                </li>
              );
            }),
          )}
        </ul>
        {regulatorioComRegistro.length === 0 && (
          <p className="m-0 text-[12.5px] text-muted-foreground">
            Nenhum registro regulatório.
          </p>
        )}
        <MarcosSemRegistro
          marcos={regulatorio.filter((m) => !visiveis(m).length)}
        />
      </SecaoOperacional>
    </div>
  );
}
