/** Seções "Fase geral" (stepper) + "Cronograma físico"/"Regulatório (CNEN)"
 * -- extraído de MonitoramentoInterno.tsx. */
import { cn } from '@/lib/utils';
import type { EventoMarco } from '@/services/monitoramento-instrumentos';
import type { MarcoCatalogo } from '@/services/monitoramento-marcos';
import { SecaoOperacional, StatusPill } from './monitoramento-ui';
import { classeValidade } from '@/lib/monitoramento-status';
import { diasAte, fmtData } from '@/lib/monitoramento-format';

export function MonitoramentoInternoFaseGeral({
  fasesGerais,
  faseAtual,
  pctAtual,
}: {
  fasesGerais: MarcoCatalogo[];
  faseAtual: MarcoCatalogo | undefined;
  pctAtual: number;
}) {
  return (
    <SecaoOperacional titulo="Fase geral">
      <div className="flex justify-between mb-2 text-sm">
        <span>{faseAtual?.rotulo ?? 'Não iniciado'} — {Math.round(pctAtual * 100)}%</span>
      </div>
      <div className="flex gap-[3px]">
        {fasesGerais.map((f) => {
          const alcancada = (f.ordem ?? -1) <= (faseAtual?.ordem ?? -1);
          const ehAtual = f.id === faseAtual?.id;
          return (
            <div
              key={f.id}
              title={f.rotulo}
              className={cn(
                'flex-1 h-2.5 rounded-full',
                ehAtual ? 'bg-primary' : alcancada ? 'bg-success' : 'bg-background',
                alcancada ? 'border-none' : 'border border-border',
              )}
            />
          );
        })}
      </div>
    </SecaoOperacional>
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
  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4 mb-4">
      <SecaoOperacional titulo="Cronograma físico" subtitulo="Entrega, instalação, licenciamento CNEN e inauguração.">
        <div className="mt-2.5 grid gap-2">
          {cronogramaFisico.map((m) => {
            const todos = eventosPorMarco.get(m.id) ?? [];
            const evs = multiploEquipamento ? todos : todos.slice(0, 1);
            return (
              <div key={m.id} className="flex justify-between items-start gap-2 text-xs">
                <span className={evs.length ? 'text-primary' : 'text-muted-foreground'}>{m.rotulo}</span>
                {evs.length === 0 ? (
                  <span className="text-muted-foreground text-[11px] text-right">—</span>
                ) : (
                  <span className="text-muted-foreground text-[11px] text-right">
                    {evs.map((ev) => (
                      <span key={ev.id} className="block">
                        {fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : `prev. ${fmtData(ev.data_prevista)}`}
                        {multiploEquipamento && ev.observacao && <span className="italic"> · {ev.observacao}</span>}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </SecaoOperacional>

      <SecaoOperacional titulo="Regulatório (CNEN)" subtitulo="Matrícula, processo, licença e validade informados no monitoramento interno.">
        <div className="mt-2.5 grid gap-2">
          {regulatorio.map((m) => {
            const todos = eventosPorMarco.get(m.id) ?? [];
            const evs = multiploEquipamento ? todos : todos.slice(0, 1);
            const ehLicenca = m.codigo === 'regulatorio_licenca_operacao';
            if (evs.length === 0) {
              return (
                <div key={m.id} className="flex justify-between items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{m.rotulo}</span>
                  <span className="text-muted-foreground text-[11px]">—</span>
                </div>
              );
            }
            return (
              <div key={m.id} className="flex flex-col gap-1.5">
                {evs.map((ev) => {
                  const diasValidadeEv = ehLicenca ? diasAte(ev.data_validade) : null;
                  return (
                    <div key={ev.id} className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-center gap-2 text-xs">
                        <span className="text-primary">
                          {m.rotulo}{ev.numero_documento ? ` (nº ${ev.numero_documento})` : ''}
                        </span>
                        {ev.status_regulatorio ? <StatusPill texto={ev.status_regulatorio} /> : <span className="text-muted-foreground text-[11px]">—</span>}
                      </div>
                      {ehLicenca && ev.data_ocorrencia && (
                        <div className="text-[10.5px] text-muted-foreground text-right">
                          Emitida em {fmtData(ev.data_ocorrencia)}
                        </div>
                      )}
                      {ehLicenca && diasValidadeEv !== null && (
                        <div className={cn('text-[10.5px] font-semibold text-right', classeValidade(diasValidadeEv))}>
                          {diasValidadeEv < 0
                            ? `Vencida há ${Math.abs(diasValidadeEv)} dia(s) (${fmtData(ev.data_validade)})`
                            : `Vence em ${diasValidadeEv} dia(s) (${fmtData(ev.data_validade)})`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </SecaoOperacional>
    </div>
  );
}
