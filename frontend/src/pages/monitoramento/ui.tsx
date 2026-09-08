/** Pecas de UI compartilhadas entre ConvenioCard e MonitoramentoInterno --
 * paleta clara reaproveitando styles/tokens.ts (mesma linguagem visual do
 * Dashboard/Painel Geral), pagina continua fora do AppLayout (decisao
 * 2026-09-03, ver MonitoramentoEquipamentosPage.tsx). */
import { colors } from '../../styles/tokens';

export const estiloCard: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '14px 18px',
};

export const estiloInput: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 12.5,
  fontFamily: 'inherit',
  outline: 'none',
};

export const rotuloCampo: React.CSSProperties = { fontSize: 10.5, color: colors.mutedText, textTransform: 'uppercase', letterSpacing: '.03em' };

/** Tabela SICONV/TransfereGov pode ter varias colunas numericas -- em tela
 * estreita (celular) isso nao cabe sem espremer o dado a ponto de ficar
 * ilegivel. Envolve a tabela nesse wrapper (`overflowX: auto`) em vez de
 * deixar o layout inteiro da pagina estourar horizontalmente -- so a
 * tabela rola, o resto do card fica no lugar. */
export const estiloTabelaWrapper: React.CSSProperties = { overflowX: 'auto', WebkitOverflowScrolling: 'touch' };
export const estiloTabela: React.CSSProperties = { width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 12.5 };
export const estiloTh: React.CSSProperties = { textAlign: 'left', color: colors.mutedText, fontSize: 10.5, fontWeight: 600, padding: '2px 8px 4px 0', borderBottom: `1px solid ${colors.border}` };
export const estiloTd: React.CSSProperties = { padding: '4px 8px 4px 0', borderBottom: `1px solid ${colors.border}` };

/** 4 familias de cor pro vocabulario de status (situacao de convenio tem
 * ~9 variacoes reais no dado -- ver MonitoramentoEquipamentosPage.tsx pra
 * legenda visivel na tela). Ordem de checagem importa: ANULADO/REJEITADO
 * antes de PRESTA (senao "PRESTAÇÃO DE CONTAS REJEITADA" cairia no laranja
 * por conter "PRESTA"). */
export function situacaoCor(situacao: string | null | undefined): { cor: string; bg: string } {
  const s = (situacao || '').toUpperCase();
  if (s.includes('ANULADO') || s.includes('REJEITAD') || s.includes('INDEFERIDO')) return { cor: colors.hipoRed, bg: colors.hipoRedBg };
  if (s.includes('EXECU') || s.includes('NORMAL') || s.includes('DEFERIDO') || s.includes('CONCLU') || s.includes('APROVAD')) return { cor: colors.hiperGreen, bg: colors.hiperGreenBg };
  if (s.includes('PRESTA') || s.includes('ANALISE') || s.includes('ANÁLISE') || s.includes('CAPTA') || s.includes('DILIG') || s.includes('AGUARDANDO') || s.includes('COMPLEMENT')) return { cor: colors.logoOrange, bg: '#fdf1de' };
  return { cor: colors.mutedText, bg: colors.surface };
}

/** Legenda das 4 familias -- usada no topo da lista principal
 * (MonitoramentoEquipamentosPage.tsx) pra deixar o vocabulario de cor
 * explicito antes do usuario escanear ~300 badges. */
export const LEGENDA_STATUS: { cor: string; rotulo: string }[] = [
  { cor: colors.hiperGreen, rotulo: 'Em execução / Normal / aprovada' },
  { cor: colors.logoOrange, rotulo: 'Prestação de contas em curso' },
  { cor: colors.hipoRed, rotulo: 'Anulado / rejeitado / indeferido' },
  { cor: colors.mutedText, rotulo: 'Demais situações' },
];

export function StatusPill({ texto }: { texto: string | null | undefined }) {
  const { cor, bg } = situacaoCor(texto);
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, background: bg, color: cor, whiteSpace: 'nowrap' }}>
      {texto || '—'}
    </span>
  );
}

export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={rotuloCampo}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

export function Secao({ titulo, contagem, children }: { titulo: string; contagem?: number; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: colors.mutedText, margin: '0 0 6px' }}>
        {titulo}{contagem !== undefined ? ` — ${contagem}` : ''}
      </h4>
      {children}
    </div>
  );
}
