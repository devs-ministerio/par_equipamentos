/** Cabeçalho de MonitoramentoInterno -- card de identificação/valor global +
 * grid de indicadores rápidos. Extraído do arquivo original (Seção 6 da
 * migração). */
import { cn } from '@/lib/utils';
import { colors } from '@/styles/tokens';
import type { InstrumentoTimeline } from '@/services/monitoramento';
import { fmtData, fmtMoeda } from '@/lib/monitoramento-format';
import { estiloCard, StatusPill } from './monitoramento-ui';

export function MonitoramentoInternoCabecalho({
  timeline,
  componenteViaSiconv,
  dataInauguracao,
  inaugurado,
  diasInauguracao,
  equipamentoFisico,
  statusLicenca,
  textoLicenca,
  alertaLicenca,
  acoesAbertasCount,
  acoesAtrasadasCount,
}: {
  timeline: InstrumentoTimeline;
  componenteViaSiconv: string | null;
  dataInauguracao: string | null;
  inaugurado: boolean;
  diasInauguracao: number | null;
  equipamentoFisico: string | null;
  statusLicenca: string;
  textoLicenca: string;
  alertaLicenca: boolean;
  acoesAbertasCount: number;
  acoesAtrasadasCount: number;
}) {
  const inst = timeline.instrumento;
  const aoVivo = timeline.ao_vivo;

  const indicadores = [
    { rotulo: 'Equipe DECAN', valor: inst.tecnico_titular ?? '—', detalhe: inst.tecnico_suplente ? `Suplente: ${inst.tecnico_suplente}` : 'Sem suplente informado' },
    { rotulo: 'Monitoramento', valor: inst.nivel_monitoramento ?? '—', detalhe: [inst.finalidade, inst.modalidade_onco].filter(Boolean).join(' · ') || 'Sem classificação complementar' },
    { rotulo: 'Equipamento físico', valor: equipamentoFisico ?? 'Não informado', detalhe: inst.equipamento_numero_serie ? `Série ${inst.equipamento_numero_serie}` : 'Registro feito no evento de entrega' },
    { rotulo: 'Licença CNEN', valor: statusLicenca, detalhe: textoLicenca, alerta: alertaLicenca },
    { rotulo: 'Inauguração', valor: inaugurado ? 'Realizada' : dataInauguracao ? 'Prevista' : 'Sem previsão', detalhe: dataInauguracao ? fmtData(dataInauguracao) : 'Sem marco registrado', alerta: diasInauguracao !== null && diasInauguracao < 0 },
    { rotulo: 'Ações abertas', valor: acoesAbertasCount, detalhe: `${acoesAtrasadasCount} atrasada(s)`, alerta: acoesAtrasadasCount > 0 },
  ];

  return (
    <>
      <div style={{ ...estiloCard, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              Convênio {inst.nr_convenio} — {inst.nome_convenente}
              {/* Chip de tipo_contratacao -- os 28 registros FAF/TED (sem
                  numero TransfereGov, usam o NUP SEI como identificador
                  aqui) agora convivem com os Convênio de verdade. */}
              {inst.tipo_contratacao && inst.tipo_contratacao !== 'Convênio' && (
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: colors.logoOrangeBg, color: colors.logoOrange }}>
                  {inst.tipo_contratacao}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: colors.mutedText }}>
              {inst.municipio}/{inst.uf} · CNES {inst.cnes} ·{' '}
              <span title="Equipamento planejado (SICONV/plano de aplicação) — não editável aqui">{inst.equipamento_descricao}</span>
            </div>
            <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 4 }}>
              Programa: {inst.programa} ({inst.tp_instrumento_programa}) · Componente:{' '}
              {inst.componente ? (
                <strong>{inst.componente}</strong>
              ) : componenteViaSiconv ? (
                <span title="Não preenchido na planilha da equipe — derivado do programa SICONV pra esse convênio">
                  <strong>{componenteViaSiconv}</strong> <em style={{ fontStyle: 'normal', color: colors.subtleText }}>(via SICONV)</em>
                </span>
              ) : (
                <strong>—</strong>
              )}
            </div>
            {(inst.responsavel_execucao_nome || inst.responsavel_execucao_contato) && (
              <div style={{ fontSize: 12, color: colors.mutedText, marginTop: 4 }}>
                Responsável técnico da execução (instituição): <strong>{inst.responsavel_execucao_nome ?? '—'}</strong>
                {inst.responsavel_execucao_contato && <> · {inst.responsavel_execucao_contato}</>}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <span>Técnico titular: <strong style={{ color: colors.primary }}>{inst.tecnico_titular ?? '—'}</strong></span>
              <span>Suplente: <strong>{inst.tecnico_suplente ?? '—'}</strong></span>
              <span>Nível: <strong>{inst.nivel_monitoramento ?? '—'}</strong></span>
              <span>Finalidade: <strong>{inst.finalidade ?? '—'}</strong></span>
              <span>Modalidade: <strong>{inst.modalidade_onco ?? '—'}</strong></span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: colors.mutedText, textTransform: 'uppercase' }}>
              Valor global {aoVivo.disponivel && '(ao vivo)'}
            </div>
            {aoVivo.disponivel ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoeda(aoVivo.valor)}</div>
                <div style={{ fontSize: 11, color: colors.mutedText }}>Liberado: {fmtMoeda(aoVivo.valor_liberado)}</div>
                {aoVivo.situacao && <div style={{ marginTop: 4 }}><StatusPill texto={aoVivo.situacao} /></div>}
                {aoVivo.valor_suspeito && (
                  <div style={{ fontSize: 10.5, color: colors.logoOrange, marginTop: 4, maxWidth: 200, textAlign: 'right' }}>
                    ⚠️ Valor global menor que o liberado — bug de truncamento conhecido do Portal da Transparência, conferir manualmente.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: colors.logoOrange }}>⚠️ Indisponível (Portal da Transparência)</div>
            )}
          </div>
        </div>

        {/* Previsao de inauguracao em destaque -- so aparece quando ha
            data (evento lançado pro marco). */}
        {dataInauguracao && (
          <div style={{
            marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              {inaugurado ? '🎉 Inaugurado em' : '📅 Previsão de inauguração:'} {fmtData(dataInauguracao)}
            </span>
            {!inaugurado && diasInauguracao !== null && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: diasInauguracao < 0 ? colors.logoOrange : colors.primary }}>
                {diasInauguracao < 0 ? `⚠️ Atrasada há ${Math.abs(diasInauguracao)} dia(s)` : `Faltam ${diasInauguracao} dia(s)`}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {indicadores.map((item) => (
          <div
            key={item.rotulo}
            className={cn('rounded-xl border bg-card p-3.5 shadow-xs', item.alerta ? 'border-warning' : 'border-border')}
          >
            <div className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.05em] text-muted-foreground uppercase">{item.rotulo}</div>
            <strong className="block text-[15px] leading-tight text-foreground">{item.valor}</strong>
            <div className={cn('mt-1 text-[11.5px] leading-snug', item.alerta ? 'text-warning' : 'text-muted-foreground')}>{item.detalhe}</div>
          </div>
        ))}
      </div>
    </>
  );
}
