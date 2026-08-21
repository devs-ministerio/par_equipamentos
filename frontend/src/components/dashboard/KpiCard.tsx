import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  color,
  info,
  onClick,
  ativo,
}: {
  label: string;
  value: string | number;
  color: string;
  info?: ReactNode;
  /** Quando presente, o card vira clicável (cursor, hover, destaque). */
  onClick?: () => void;
  /** Destaca visualmente o card quando o filtro que ele aciona já está ativo. */
  ativo?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: '16px 18px',
        flex: '1 1 0',
        minWidth: 180,
        minHeight: 69,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        border: ativo ? `1.5px solid ${color}` : '1.5px solid transparent',
        boxShadow: ativo ? `0 0 0 3px ${color}22` : 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          color: '#667085',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {label}
        {info}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6, color }}>{value}</div>
    </div>
  );
}
