import { colors } from '@/styles/tokens';

/** Cada estatistica de cobertura e o SEU PROPRIO card (2026-08-22, pedido
 * explicito) -- alinhados entre si (mesma altura/padding, `flex: 1` divide o
 * espaco igual) e, como as duas familias usam a mesma estrutura, tambem
 * alinhados verticalmente entre os cards de Tomografo e Ressonancia na
 * mesma linha do grid. Numero em preto/neutro de proposito (nao mais
 * vermelho/laranja/verde por gravidade, decisao 2026-08-22) -- esses 3 sao
 * "quantos", nao "quao grave"; quem carrega o sinal de gravidade agora e o
 * Ranking (barra por severidade) e o Mapa (gradiente), pra nao competir/
 * repetir o mesmo alerta em 3 lugares diferentes da mesma tela. */
export function PainelGeralStatCard({ valor, label }: { valor: string; label: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '16px 12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: colors.primaryDark, letterSpacing: '-0.01em' }}>{valor}</div>
      <div style={{ fontSize: 10.5, color: colors.subtleText, marginTop: 5, lineHeight: 1.35 }}>{label}</div>
    </div>
  );
}
