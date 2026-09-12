/** Seção "Linha do tempo de eventos" -- toggle do form de lançamento +
 * histórico. Extraído de MonitoramentoInterno.tsx. */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { EventoMarco, MarcoCatalogo } from '@/services/monitoramento';
import { fmtData } from '@/lib/monitoramento-format';
import type { EnviarEventoFormValues } from '@/lib/validations/monitoramento';
import { MonitoramentoInternoFormEvento } from './monitoramento-interno-form-evento';
import { estiloCard, estiloInput, SecaoOperacional, StatusPill } from './monitoramento-ui';

export function MonitoramentoInternoEventos({
  marcos,
  eventos,
  podeEditar,
  onRegistrar,
}: {
  marcos: MarcoCatalogo[];
  eventos: EventoMarco[];
  podeEditar: boolean;
  onRegistrar: (valores: EnviarEventoFormValues) => Promise<void>;
}) {
  const [formAberto, setFormAberto] = useState(false);
  const marcoPorId = new Map(marcos.map((m) => [m.id, m]));

  return (
    <SecaoOperacional
      titulo="Linha do tempo de eventos"
      subtitulo="Histórico dos marcos lançados para este instrumento."
      acao={
        <button
          disabled={!podeEditar}
          onClick={() => setFormAberto((v) => !v)}
          aria-expanded={formAberto}
          className={cn(estiloInput, 'cursor-pointer bg-primary text-primary-foreground border-none font-semibold')}
        >
          {formAberto ? 'Cancelar' : '+ Lançar evento'}
        </button>
      }
    >
      {formAberto && (
        <MonitoramentoInternoFormEvento
          marcos={marcos}
          onRegistrar={async (valores) => {
            await onRegistrar(valores);
            setFormAberto(false);
          }}
        />
      )}

      {eventos.length === 0 ? (
        <p className="text-muted-foreground italic text-sm">Nenhum evento lançado ainda.</p>
      ) : (
        <div className="grid gap-2">
          {/* Backend ja devolve mais recente primeiro -- numera decrescente
              (evento mais antigo = 01) pra ficar claro que e sequencia de
              lancamento, nao ranking. */}
          {eventos.map((ev, i) => {
            const marco = marcoPorId.get(ev.marco_id);
            const numero = String(eventos.length - i).padStart(2, '0');
            return (
              <div key={ev.id} className={cn(estiloCard, 'flex gap-3')}>
                <div
                  className={cn(
                    'w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center text-[10.5px] font-bold',
                    i === 0 ? 'bg-success-bg text-success' : 'bg-background text-muted-foreground',
                  )}
                >
                  {numero}
                </div>
                <div className="min-w-20 text-[11px] text-muted-foreground">
                  {fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : fmtData(ev.created_at.slice(0, 10))}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">
                    {marco?.rotulo ?? `Marco ${ev.marco_id}`}
                    {ev.numero_documento && <> — nº {ev.numero_documento}</>}
                    {ev.status_regulatorio && <> — <StatusPill texto={ev.status_regulatorio} /></>}
                  </div>
                  {ev.data_validade && (
                    <div className="text-[11px] text-muted-foreground mt-px">Validade: {fmtData(ev.data_validade)}</div>
                  )}
                  {ev.observacao && <div className="text-[12.5px] text-muted-foreground mt-0.5">{ev.observacao}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SecaoOperacional>
  );
}
