/** Seção "Linha do tempo de eventos" -- toggle do form de lançamento +
 * histórico. Extraído de MonitoramentoInterno.tsx. */
import { useState } from 'react';
import { colors } from '@/styles/tokens';
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
          style={{ ...estiloInput, cursor: 'pointer', background: colors.primary, color: '#fff', border: 'none', fontWeight: 600 }}
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
        <p style={{ color: colors.mutedText, fontStyle: 'italic', fontSize: 13 }}>Nenhum evento lançado ainda.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {/* Backend ja devolve mais recente primeiro -- numera decrescente
              (evento mais antigo = 01) pra ficar claro que e sequencia de
              lancamento, nao ranking. */}
          {eventos.map((ev, i) => {
            const marco = marcoPorId.get(ev.marco_id);
            const numero = String(eventos.length - i).padStart(2, '0');
            return (
              <div key={ev.id} style={{ ...estiloCard, display: 'flex', gap: 12 }}>
                <div
                  style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i === 0 ? colors.hiperGreenBg : colors.surface,
                    color: i === 0 ? colors.hiperGreen : colors.mutedText,
                    fontSize: 10.5, fontWeight: 700,
                  }}
                >
                  {numero}
                </div>
                <div style={{ minWidth: 80, fontSize: 11, color: colors.mutedText }}>
                  {fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : fmtData(ev.created_at.slice(0, 10))}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {marco?.rotulo ?? `Marco ${ev.marco_id}`}
                    {ev.numero_documento && <> — nº {ev.numero_documento}</>}
                    {ev.status_regulatorio && <> — <StatusPill texto={ev.status_regulatorio} /></>}
                  </div>
                  {ev.data_validade && (
                    <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 1 }}>Validade: {fmtData(ev.data_validade)}</div>
                  )}
                  {ev.observacao && <div style={{ fontSize: 12.5, color: colors.mutedText, marginTop: 2 }}>{ev.observacao}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SecaoOperacional>
  );
}
