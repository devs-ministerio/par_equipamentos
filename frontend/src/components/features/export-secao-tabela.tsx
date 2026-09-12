import { colors } from '@/styles/tokens';

interface Campo {
  key: string;
  label: string;
}

/** Checkbox "ativa a tabela" + lista de campos selecionaveis dela --
 * extraido de ExportPdfModal (2026-09-11), usado so ali. */
export function ExportSecaoTabela({
  titulo,
  ativa,
  onToggleAtiva,
  campos,
  selecionados,
  onToggleCampo,
}: {
  titulo: string;
  ativa: boolean;
  onToggleAtiva: () => void;
  campos: Campo[];
  selecionados: Set<string>;
  onToggleCampo: (key: string) => void;
}) {
  return (
    <div style={{ marginTop: 14, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: '#fafbfd',
          borderBottom: ativa ? `1px solid ${colors.border}` : 'none',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 13,
          color: '#16213e',
        }}
      >
        <input type="checkbox" checked={ativa} onChange={onToggleAtiva} style={{ width: 15, height: 15, accentColor: colors.primary }} />
        {titulo}
      </label>
      {ativa && (
        <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {campos.map((c) => (
            <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475066', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selecionados.has(c.key)}
                onChange={() => onToggleCampo(c.key)}
                style={{ width: 13, height: 13, accentColor: colors.primary }}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
