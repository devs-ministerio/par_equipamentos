import { statusMeta } from '../../utils/status';

export function StatusBadge({ cobertura }: { cobertura: number }) {
  const meta = statusMeta(cobertura);
  return (
    <span
      style={{
        background: meta.bg,
        color: meta.color,
        fontSize: 11.5,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: 20,
      }}
    >
      {meta.label}
    </span>
  );
}
