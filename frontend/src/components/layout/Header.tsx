import { colors } from '../../styles/tokens';

export function Header() {
  return (
    <div
      style={{
        background: colors.primary,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: 60,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 34,
            height: 34,
            background: colors.logoOrange,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.primary,
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          MS
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
          DECAN - Análise de Méritos
        </div>
      </div>
    </div>
  );
}
