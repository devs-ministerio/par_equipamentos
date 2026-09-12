/** Seções "Fase geral" (stepper) + "Cronograma físico"/"Regulatório (CNEN)"
 * -- extraído de MonitoramentoInterno.tsx. */
import { colors } from '@/styles/tokens';
import type { EventoMarco, MarcoCatalogo } from '@/services/monitoramento';
import { corValidade, SecaoOperacional, StatusPill } from './monitoramento-ui';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
        <span>{faseAtual?.rotulo ?? 'Não iniciado'} — {Math.round(pctAtual * 100)}%</span>
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {fasesGerais.map((f) => {
          const alcancada = (f.ordem ?? -1) <= (faseAtual?.ordem ?? -1);
          const ehAtual = f.id === faseAtual?.id;
          return (
            <div
              key={f.id}
              title={f.rotulo}
              style={{
                flex: 1, height: 10, borderRadius: 999,
                background: ehAtual ? colors.primary : alcancada ? colors.hiperGreen : colors.surface,
                border: alcancada ? 'none' : `1px solid ${colors.border}`,
              }}
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
      <SecaoOperacional titulo="Cronograma físico" subtitulo="Fabricação, chegada, entrega, instalação, comissionamento e inauguração.">
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {cronogramaFisico.map((m) => {
            const evs = eventosPorMarco.get(m.id);
            const ev = evs?.[0];
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: ev ? colors.primary : colors.mutedText }}>{m.rotulo}</span>
                <span style={{ color: colors.mutedText, fontSize: 11, textAlign: 'right' }}>
                  {ev ? (fmtData(ev.data_ocorrencia) !== '—' ? fmtData(ev.data_ocorrencia) : `prev. ${fmtData(ev.data_prevista)}`) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </SecaoOperacional>

      <SecaoOperacional titulo="Regulatório (CNEN)" subtitulo="Matrícula, processo, licença e validade informados no monitoramento interno.">
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {regulatorio.map((m) => {
            const evs = eventosPorMarco.get(m.id);
            const ev = evs?.[0];
            const ehLicenca = m.codigo === 'regulatorio_licenca_operacao';
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: ev ? colors.primary : colors.mutedText }}>
                    {m.rotulo}{ev?.numero_documento ? ` (nº ${ev.numero_documento})` : ''}
                  </span>
                  {ev?.status_regulatorio ? <StatusPill texto={ev.status_regulatorio} /> : <span style={{ color: colors.mutedText, fontSize: 11 }}>—</span>}
                </div>
                {ehLicenca && eventoLicenca?.data_ocorrencia && (
                  <div style={{ fontSize: 10.5, color: colors.mutedText, textAlign: 'right' }}>
                    Emitida em {fmtData(eventoLicenca.data_ocorrencia)}
                  </div>
                )}
                {ehLicenca && diasValidade !== null && (
                  <div style={{ fontSize: 10.5, color: corValidade(diasValidade), fontWeight: 600, textAlign: 'right' }}>
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
