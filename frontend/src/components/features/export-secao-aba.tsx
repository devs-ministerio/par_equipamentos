import { colors } from '@/styles/tokens';

interface Campo {
  key: string;
  label: string;
}

/** Igual a ExportSecaoTabela, mas com descricao da aba abaixo do titulo --
 * extraido de ExportXlsxModal (2026-09-11), usado so ali. */
export function ExportSecaoAba({
  titulo,
  descricao,
  ativa,
  onToggleAtiva,
  campos,
  selecionados,
  onToggleCampo,
}: {
  titulo: string;
  descricao: string;
  ativa: boolean;
  onToggleAtiva: () => void;
  campos: readonly Campo[];
  selecionados: Set<string>;
  onToggleCampo: (key: string) => void;
}) {
  return (
    <div style={{ marginTop: 14, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <label
        style={{
          display: 'block',
          padding: '10px 14px',
          background: '#fafbfd',
          borderBottom: ativa ? `1px solid ${colors.border}` : 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#16213e' }}>
          <input
            type="checkbox"
            checked={ativa}
            onChange={onToggleAtiva}
            style={{ width: 15, height: 15, accentColor: colors.primary }}
          />
          {titulo}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: colors.mutedText, marginLeft: 23, marginTop: 2 }}>
          {descricao}
        </span>
      </label>
      {ativa && (
        <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {campos.map((c) => (
            <label
              key={c.key}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475066', cursor: 'pointer' }}
            >
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
