/** Seções "Fase geral" (stepper) + "Cronograma físico"/"Regulatório (CNEN)"
 * -- extraído de MonitoramentoInterno.tsx. */
import { cn } from '@/lib/utils';
import type { EventoMarco, MarcoCatalogo } from '@/services/monitoramento';
import { classeValidade, SecaoOperacional, StatusPill } from './monitoramento-ui';
import { fmtData } from '@/lib/monitoramento-format';

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
    <SecaoOperacional titulo="Fase geral" subtitulo="Marco mais avançado registrado no acompanhamento interno.">
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
  eventoLicenca,
  diasValidade,
}: {
  cronogramaFisico: MarcoCatalogo[];
  regulatorio: MarcoCatalogo[];
  eventosPorMarco: Map<number, EventoMarco[]>;
  eventoLicenca: EventoMarco | null;
  diasValidade: number | null;
}) {
  return (
    <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-4 mb-4">
      <SecaoOperacional titulo="Cronograma físico" subtitulo="Fabricação, chegada, entrega, instalação, comissionamento e inauguração.">
        <div className="mt-2.5 grid gap-2">
          {cronogramaFisico.map((m) => {
            const evs = eventosPorMarco.get(m.id);
            const ev = evs?.[0];
            return (
              <div key={m.id} className="flex justify-between items-center gap-2 text-xs">
                <span className={ev ? 'text-primary' : 'text-muted-foreground'}>{m.rotulo}</span>
                <span className="text-muted-foreground text-[11px] text-right">
                  {ev ? (fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : `prev. ${fmtData(ev.data_prevista)}`) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </SecaoOperacional>

      <SecaoOperacional titulo="Regulatório (CNEN)" subtitulo="Matrícula, processo, licença e validade informados no monitoramento interno.">
        <div className="mt-2.5 grid gap-2">
          {regulatorio.map((m) => {
            const evs = eventosPorMarco.get(m.id);
            const ev = evs?.[0];
            const ehLicenca = m.codigo === 'regulatorio_licenca_operacao';
            return (
              <div key={m.id} className="flex flex-col gap-0.5">
                <div className="flex justify-between items-center gap-2 text-xs">
                  <span className={ev ? 'text-primary' : 'text-muted-foreground'}>
                    {m.rotulo}{ev?.numero_documento ? ` (nº ${ev.numero_documento})` : ''}
                  </span>
                  {ev?.status_regulatorio ? <StatusPill texto={ev.status_regulatorio} /> : <span className="text-muted-foreground text-[11px]">—</span>}
                </div>
                {ehLicenca && eventoLicenca?.data_ocorrencia && (
                  <div className="text-[10.5px] text-muted-foreground text-right">
                    Emitida em {fmtData(eventoLicenca.data_ocorrencia)}
                  </div>
                )}
                {ehLicenca && diasValidade !== null && (
                  <div className={cn('text-[10.5px] font-semibold text-right', classeValidade(diasValidade))}>
                    {diasValidade < 0
                      ? `⚠️ Vencida há ${Math.abs(diasValidade)} dia(s) (${fmtData(eventoLicenca?.data_validade)})`
                      : `Vence em ${diasValidade} dia(s) (${fmtData(eventoLicenca?.data_validade)})`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SecaoOperacional>
    </div>
  );
}
