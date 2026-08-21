import { useEffect, useRef, useState } from 'react';
import { colors } from '../../styles/tokens';
import { normalizarTexto } from '../../utils/texto';

export interface FilterOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  placeholder: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export function MultiSelectFilter({ placeholder, options, selected, onChange }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = options.filter((o) => normalizarTexto(o.label).includes(normalizarTexto(search)));
  const active = selected.length > 0 || open;
  const label = selected.length === 0 ? placeholder : `${selected.length} selecionado(s)`;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '6px 14px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          border: `1.5px solid ${active ? colors.primary : colors.border}`,
          background: selected.length > 0 ? colors.primaryLight : open ? '#f0f4ff' : '#f7f8fb',
          color: active ? colors.primary : '#475066',
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 100,
            background: '#fff',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            minWidth: 220,
            padding: '8px 0',
            marginTop: 4,
          }}
        >
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #f0f1f5' }}>
            <input
              type="text"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                padding: '5px 8px',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#16213e',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  style={{ width: 15, height: 15, accentColor: colors.primary, cursor: 'pointer' }}
                />
                {opt.label}
              </label>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: colors.subtleText }}>Nenhum resultado</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
