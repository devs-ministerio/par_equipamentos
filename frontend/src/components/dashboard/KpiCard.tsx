import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  color,
  info,
}: {
  label: string;
  value: string | number;
  color: string;
  info?: ReactNode;
}) {
  return (
    <div
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
