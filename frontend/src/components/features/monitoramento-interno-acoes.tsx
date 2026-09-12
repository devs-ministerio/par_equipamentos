/** Seção "Ações de monitoramento" -- form de criação + lista, visualmente
 * separada da timeline de eventos (design pedido pelo usuário 2026-09-09).
 * Extraído de MonitoramentoInterno.tsx. */
import { cn } from '@/lib/utils';
import type { AcaoMonitoramento } from '@/services/monitoramento';
import { diasAte, fmtData } from '@/lib/monitoramento-format';
import type { CriarAcaoFormValues } from '@/lib/validations/monitoramento';
import { MonitoramentoInternoFormAcao } from './monitoramento-interno-form-acao';
import { SecaoOperacional, estiloInput } from './monitoramento-ui';

export function MonitoramentoInternoAcoes({
  acoes,
  podeEditar,
  concluindoAcaoId,
  onCriar,
  onConcluir,
}: {
  acoes: AcaoMonitoramento[] | undefined;
  podeEditar: boolean;
  concluindoAcaoId: number | null;
  onCriar: (valores: CriarAcaoFormValues) => Promise<void>;
  onConcluir: (acaoId: number) => void;
}) {
  return (
    <SecaoOperacional
      titulo="Ações de monitoramento"
      subtitulo="Pendências operacionais da equipe, separadas dos eventos históricos."
      destaque
    >
      <MonitoramentoInternoFormAcao podeEditar={podeEditar} onCriar={onCriar} />

      {!acoes || acoes.length === 0 ? (
        <p className="text-muted-foreground italic text-[12.5px] m-0">Nenhuma ação registrada ainda.</p>
      ) : (
        <div className="grid gap-1.5">
          {[...acoes]
            .sort((a, b) => Number(!!a.data_conclusao) - Number(!!b.data_conclusao) || (a.data_prevista ?? '9999').localeCompare(b.data_prevista ?? '9999'))
            .map((acao) => {
              const diasPrazo = !acao.data_conclusao ? diasAte(acao.data_prevista) : null;
              const atrasada = diasPrazo !== null && diasPrazo < 0;
              return (
                <div
                  key={acao.id}
                  className={cn(
                    'flex justify-between items-center gap-2.5 bg-card rounded-lg py-2 px-2.5 border',
                    atrasada ? 'border-destructive' : 'border-border',
                    acao.data_conclusao && 'opacity-60',
                  )}
                >
                  <div className="min-w-0">
                    <div className={cn('text-[12.5px] font-semibold', acao.data_conclusao && 'line-through')}>
                      {acao.descricao}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {acao.responsavel && <>Responsável: {acao.responsavel} · </>}
                      {acao.data_conclusao
                        ? `Concluída em ${fmtData(acao.data_conclusao)}`
                        : acao.data_prevista
                          ? `Prazo: ${fmtData(acao.data_prevista)}`
                          : 'Sem prazo definido'}
                      {atrasada && <span className="text-destructive font-bold"> · ⚠️ atrasada há {Math.abs(diasPrazo!)} dia(s)</span>}
                    </div>
                  </div>
                  {!acao.data_conclusao && (
                    <button
                      onClick={() => onConcluir(acao.id)}
                      disabled={!podeEditar || concluindoAcaoId === acao.id}
                      aria-label={`Concluir ação: ${acao.descricao}`}
                      className={cn(estiloInput, 'cursor-pointer bg-transparent text-success border border-success font-semibold py-1 px-2.5 whitespace-nowrap')}
                    >
                      {concluindoAcaoId === acao.id ? '...' : '✓ Concluir'}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </SecaoOperacional>
  );
}
