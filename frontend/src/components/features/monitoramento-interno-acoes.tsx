/** Seção "Ações de monitoramento" -- form de criação + lista, visualmente
 * separada da timeline de eventos (design pedido pelo usuário 2026-09-09).
 * Extraído de MonitoramentoInterno.tsx. */
import { colors } from '@/styles/tokens';
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
        <p style={{ color: colors.mutedText, fontStyle: 'italic', fontSize: 12.5, margin: 0 }}>Nenhuma ação registrada ainda.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {[...acoes]
            .sort((a, b) => Number(!!a.data_conclusao) - Number(!!b.data_conclusao) || (a.data_prevista ?? '9999').localeCompare(b.data_prevista ?? '9999'))
            .map((acao) => {
              const diasPrazo = !acao.data_conclusao ? diasAte(acao.data_prevista) : null;
              const atrasada = diasPrazo !== null && diasPrazo < 0;
              return (
                <div
                  key={acao.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    background: '#fff', borderRadius: 8, padding: '8px 10px',
                    border: `1px solid ${atrasada ? colors.hipoRed : colors.border}`,
                    opacity: acao.data_conclusao ? 0.6 : 1,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, textDecoration: acao.data_conclusao ? 'line-through' : 'none' }}>
                      {acao.descricao}
                    </div>
                    <div style={{ fontSize: 11, color: colors.mutedText, marginTop: 2 }}>
                      {acao.responsavel && <>Responsável: {acao.responsavel} · </>}
                      {acao.data_conclusao
                        ? `Concluída em ${fmtData(acao.data_conclusao)}`
                        : acao.data_prevista
                          ? `Prazo: ${fmtData(acao.data_prevista)}`
                          : 'Sem prazo definido'}
                      {atrasada && <span style={{ color: colors.hipoRed, fontWeight: 700 }}> · ⚠️ atrasada há {Math.abs(diasPrazo!)} dia(s)</span>}
                    </div>
                  </div>
                  {!acao.data_conclusao && (
                    <button
                      onClick={() => onConcluir(acao.id)}
                      disabled={!podeEditar || concluindoAcaoId === acao.id}
                      aria-label={`Concluir ação: ${acao.descricao}`}
                      style={{ ...estiloInput, cursor: 'pointer', background: 'transparent', color: colors.hiperGreen, border: `1px solid ${colors.hiperGreen}`, fontWeight: 600, padding: '4px 10px', whiteSpace: 'nowrap' }}
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
