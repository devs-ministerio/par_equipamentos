import type { CSSProperties } from 'react';
import { colors } from '../../styles/tokens';

interface Props {
  page: number; // 1-indexado
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalItems, pageSize, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const inicio = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, totalItems);

  const btnStyle = (disabled: boolean): CSSProperties => ({
    padding: '5px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${colors.border}`,
    background: disabled ? '#f7f8fb' : '#fff',
    color: disabled ? colors.subtleText : '#475066',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 18px',
        borderTop: '1px solid #eef0f4',
        fontSize: 12,
        color: colors.mutedText,
      }}
    >
      <span>
        Mostrando {inicio}–{fim} de {totalItems}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} style={btnStyle(page <= 1)}>
          ‹ Anterior
        </button>
        <span>
          Página {page} de {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          style={btnStyle(page >= totalPages)}
        >
          Próxima ›
        </button>
      </div>
    </div>
  );
}
