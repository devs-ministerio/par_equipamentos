/** Seção "Linha do tempo de eventos" -- toggle do form de lançamento +
 * histórico. Extraído de MonitoramentoInterno.tsx.
 *
 * Editar/excluir (Plan Mode monitoramento-evolucao 2026-09-19) seguem a
 * mesma disciplina append-only do backend: "editar" reabre o form
 * pré-preenchido e, ao salvar, lança um evento novo corrigido (o antigo
 * sai da lista, mas continua auditável); "excluir" pede motivo e faz
 * exclusão lógica -- nenhum dos dois é um DELETE/UPDATE físico. */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { EventoMarco } from '@/services/monitoramento-instrumentos';
import type { MarcoCatalogo } from '@/services/monitoramento-marcos';
import { fmtData } from '@/lib/monitoramento-format';
import type { EnviarEventoFormValues } from '@/lib/validations/monitoramento';
import { MonitoramentoInternoFormEvento } from './monitoramento-interno-form-evento';
import { ConfirmarExclusaoComMotivo, estiloCard, estiloInput, SecaoOperacional, StatusPill } from './monitoramento-ui';

function valoresIniciaisDoEvento(ev: EventoMarco): Partial<EnviarEventoFormValues> {
  return {
    marcoId: String(ev.marco_id),
    faseGeralId: ev.fase_geral_id != null ? String(ev.fase_geral_id) : undefined,
    dataOcorrencia: ev.data_ocorrencia ?? undefined,
    dataPrevista: ev.data_prevista ?? undefined,
    statusRegulatorio: ev.status_regulatorio ?? undefined,
    numeroDocumento: ev.numero_documento ?? undefined,
    dataValidade: ev.data_validade ?? undefined,
    observacao: ev.observacao ?? undefined,
  };
}

export function MonitoramentoInternoEventos({
  marcos,
  eventos,
  podeEditar,
  onRegistrar,
  onEditar,
  onExcluir,
}: {
  marcos: MarcoCatalogo[];
  eventos: EventoMarco[];
  podeEditar: boolean;
  onRegistrar: (valores: EnviarEventoFormValues) => Promise<void>;
  onEditar: (eventoId: number, valores: EnviarEventoFormValues) => Promise<void>;
  onExcluir: (eventoId: number, motivo: string) => Promise<void>;
}) {
  const [formAberto, setFormAberto] = useState(false);
  const [eventoEmEdicao, setEventoEmEdicao] = useState<number | null>(null);
  const [eventoEmExclusao, setEventoEmExclusao] = useState<number | null>(null);
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
            const emEdicao = eventoEmEdicao === ev.id;
            const emExclusao = eventoEmExclusao === ev.id;
            return (
              <div key={ev.id} className={cn(estiloCard, 'relative flex gap-3 flex-col')}>
                <div className={cn('flex gap-3', podeEditar && !emEdicao && !emExclusao && 'pr-36')}>
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
                    <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                      {marco?.rotulo ?? `Marco ${ev.marco_id}`}
                      {ev.numero_documento && <> — nº {ev.numero_documento}</>}
                      {ev.status_regulatorio && <> — <StatusPill texto={ev.status_regulatorio} /></>}
                    </div>
                    {ev.data_validade && (
                      <div className="text-[11px] text-muted-foreground mt-px">Validade: {fmtData(ev.data_validade)}</div>
                    )}
                    {ev.observacao && <div className="text-[12.5px] text-muted-foreground mt-0.5">{ev.observacao}</div>}
                    {/* Marcador de criação/alteração (Plan Mode monitoramento-
                        evolucao 2026-09-19) -- pedido do usuário: "coloque um
                        marcador com o nome do responsável que criou o evento". */}
                    <div className="text-[10.5px] text-muted-foreground/80 mt-1">
                      {ev.autor_nome ? `Lançado por ${ev.autor_nome}` : 'Autor não registrado'}
                      {ev.created_at && ` · ${fmtData(ev.created_at.slice(0, 10))}`}
                    </div>
                  </div>
                </div>
                {podeEditar && !emEdicao && !emExclusao && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-row gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setEventoEmEdicao(ev.id); setEventoEmExclusao(null); }}
                      className={cn(estiloInput, 'cursor-pointer bg-transparent text-primary border border-primary text-[11px] font-semibold py-1 px-2')}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEventoEmExclusao(ev.id); setEventoEmEdicao(null); }}
                      className={cn(estiloInput, 'cursor-pointer bg-transparent text-destructive border border-destructive text-[11px] font-semibold py-1 px-2')}
                    >
                      Excluir
                    </button>
                  </div>
                )}

                {emEdicao && marco && (
                  <MonitoramentoInternoFormEvento
                    marcos={marcos}
                    marcoFixo={marco}
                    valoresIniciais={valoresIniciaisDoEvento(ev)}
                    rotuloSubmit="Salvar correção"
                    onRegistrar={async (valores) => {
                      await onEditar(ev.id, valores);
                      setEventoEmEdicao(null);
                    }}
                  />
                )}

                {emExclusao && (
                  <ConfirmarExclusaoComMotivo
                    onExcluir={async (motivo) => {
                      await onExcluir(ev.id, motivo);
                      setEventoEmExclusao(null);
                    }}
                    onCancelar={() => setEventoEmExclusao(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </SecaoOperacional>
  );
}
