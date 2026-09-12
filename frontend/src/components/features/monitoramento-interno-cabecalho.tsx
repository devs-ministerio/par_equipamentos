/** Cabeçalho de MonitoramentoInterno -- card de identificação/valor global +
 * grid de indicadores rápidos. Extraído do arquivo original (Seção 6 da
 * migração). */
import { cn } from '@/lib/utils';
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
      <div className={cn(estiloCard, 'mb-4')}>
        <div className="flex justify-between flex-wrap gap-3">
          <div>
            <div className="font-bold text-[15px] flex items-center gap-2">
              Convênio {inst.nr_convenio} — {inst.nome_convenente}
              {/* Chip de tipo_contratacao -- os 28 registros FAF/TED (sem
                  numero TransfereGov, usam o NUP SEI como identificador
                  aqui) agora convivem com os Convênio de verdade. */}
              {inst.tipo_contratacao && inst.tipo_contratacao !== 'Convênio' && (
                <span className="text-[10.5px] font-bold py-0.5 px-2 rounded-full bg-warning-bg text-warning">
                  {inst.tipo_contratacao}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {inst.municipio}/{inst.uf} · CNES {inst.cnes} ·{' '}
              <span title="Equipamento planejado (SICONV/plano de aplicação) — não editável aqui">{inst.equipamento_descricao}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Programa: {inst.programa} ({inst.tp_instrumento_programa}) · Componente:{' '}
              {inst.componente ? (
                <strong>{inst.componente}</strong>
              ) : componenteViaSiconv ? (
                <span title="Não preenchido na planilha da equipe — derivado do programa SICONV pra esse convênio">
                  <strong>{componenteViaSiconv}</strong> <em className="not-italic text-muted-foreground/70">(via SICONV)</em>
                </span>
              ) : (
                <strong>—</strong>
              )}
            </div>
            {(inst.responsavel_execucao_nome || inst.responsavel_execucao_contato) && (
              <div className="text-xs text-muted-foreground mt-1">
                Responsável técnico da execução (instituição): <strong>{inst.responsavel_execucao_nome ?? '—'}</strong>
                {inst.responsavel_execucao_contato && <> · {inst.responsavel_execucao_contato}</>}
              </div>
            )}
            <div className="text-[11.5px] text-muted-foreground mt-1.5 flex flex-wrap gap-3">
              <span>Técnico titular: <strong className="text-primary">{inst.tecnico_titular ?? '—'}</strong></span>
              <span>Suplente: <strong>{inst.tecnico_suplente ?? '—'}</strong></span>
              <span>Nível: <strong>{inst.nivel_monitoramento ?? '—'}</strong></span>
              <span>Finalidade: <strong>{inst.finalidade ?? '—'}</strong></span>
              <span>Modalidade: <strong>{inst.modalidade_onco ?? '—'}</strong></span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] text-muted-foreground uppercase">
              Valor global {aoVivo.disponivel && '(ao vivo)'}
            </div>
            {aoVivo.disponivel ? (
              <>
                <div className="text-base font-semibold">{fmtMoeda(aoVivo.valor)}</div>
                <div className="text-[11px] text-muted-foreground">Liberado: {fmtMoeda(aoVivo.valor_liberado)}</div>
                {aoVivo.situacao && <div className="mt-1"><StatusPill texto={aoVivo.situacao} /></div>}
                {aoVivo.valor_suspeito && (
                  <div className="text-[10.5px] text-warning mt-1 max-w-[200px] text-right">
                    ⚠️ Valor global menor que o liberado — bug de truncamento conhecido do Portal da Transparência, conferir manualmente.
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-warning">⚠️ Indisponível (Portal da Transparência)</div>
            )}
          </div>
        </div>

        {/* Previsao de inauguracao em destaque -- so aparece quando ha
            data (evento lançado pro marco). */}
        {dataInauguracao && (
          <div className="mt-3 pt-2.5 border-t border-border flex justify-between items-center flex-wrap gap-2">
            <span className="text-[12.5px] font-semibold">
              {inaugurado ? '🎉 Inaugurado em' : '📅 Previsão de inauguração:'} {fmtData(dataInauguracao)}
            </span>
            {!inaugurado && diasInauguracao !== null && (
              <span className={cn('text-[11.5px] font-bold', diasInauguracao < 0 ? 'text-warning' : 'text-primary')}>
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
