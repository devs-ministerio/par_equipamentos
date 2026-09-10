/** Pecas de UI compartilhadas entre ConvenioCard e MonitoramentoInterno --
 * paleta clara reaproveitando styles/tokens.ts (mesma linguagem visual do
 * Dashboard/Painel Geral), pagina continua fora do AppLayout (decisao
 * 2026-09-03, ver MonitoramentoEquipamentosPage.tsx). */
import { colors } from '../../styles/tokens';

/** Sombra suave em vez de so borda -- cartao "flutua" sobre o fundo
 * (colors.surface) ao inves de se misturar nele, mesma linguagem visual
 * do protótipo de referencia (Stitch, 2026-09-08) adaptada pros tokens
 * do projeto. */
export const estiloCard: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: '16px 20px',
  boxShadow: '0 1px 3px rgba(22,33,62,0.06)',
};

export const estiloInput: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: '9px 12px',
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
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px 3px 8px', borderRadius: 20,
      fontSize: 10.5, fontWeight: 700, background: bg, color: cor, whiteSpace: 'nowrap', border: `1px solid ${cor}33`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor, flexShrink: 0 }} />
      {texto || '—'}
    </span>
  );
}

export function Campo({ label, legenda, children }: { label: string; legenda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={rotuloCampo}>{label}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
      {legenda && <div style={{ fontSize: 10, color: colors.mutedText, marginTop: 1 }}>{legenda}</div>}
    </div>
  );
}

/** Cor por urgencia de vencimento (licenca CNEN, mas generico) -- achado
 * 2026-09-09, movido pra ca de MonitoramentoInterno.tsx pra reaproveitar
 * tambem no Painel de Gestao. `dias` negativo = ja venceu. */
export function corValidade(dias: number): string {
  if (dias < 0) return colors.hipoRed;
  if (dias < 90) return colors.hipoRed;
  if (dias < 180) return colors.logoOrange;
  return colors.hiperGreen;
}

/** {rotulo, quantidade} generico -- distribuicao por fase/tecnico/UF/
 * componente/tipo de contratacao (achado 2026-09-09, movido pra ca de
 * MonitoramentoOverviewPage.tsx pra ser reaproveitado tambem no Painel
 * de Gestao, ver MonitoramentoPainelPage.tsx). */
export type ContagemRotulo = { rotulo: string; quantidade: number };

/** Barra horizontal simples (sem lib de grafico -- so CSS, mais leve). */
export function BarraDistribuicao({ itens, corBarra }: { itens: ContagemRotulo[]; corBarra: string }) {
  const max = Math.max(1, ...itens.map((i) => i.quantidade));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {itens.map((item) => (
        <div key={item.rotulo}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
            <span>{item.rotulo}</span>
            <strong>{item.quantidade}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: colors.surface }}>
            <div style={{ height: '100%', borderRadius: 999, width: `${(item.quantidade / max) * 100}%`, background: corBarra }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Secao({ titulo, contagem, children }: { titulo: string; contagem?: number; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{
        fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: colors.primary,
        margin: '0 0 10px', paddingBottom: 6, borderBottom: `1px solid ${colors.border}`,
      }}>
        {titulo}{contagem !== undefined ? ` — ${contagem}` : ''}
      </h4>
      {children}
    </div>
  );
}
