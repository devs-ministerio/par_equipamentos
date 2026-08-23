import { useEffect, useRef, useState } from 'react';
import { colors } from '../../styles/tokens';
import { normalizarTexto } from '../../utils/texto';

export interface SingleSelectOption {
  value: string;
  label: string;
}

interface SingleSelectFilterProps {
  placeholder: string;
  options: SingleSelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Rotulo da linha "limpar selecao" no topo da lista -- omitir esconde a linha (selecao sempre obrigatoria). */
  clearLabel?: string;
  minWidth?: number;
}

/**
 * Combobox de selecao unica com busca -- mesmo visual/padrao do
 * MultiSelectFilter (usado nos filtros do Dashboard), mas pra escolher UM
 * item so (fecha e substitui ao clicar, sem checkbox) -- caso do seletor de
 * Macro/Municipio no recorte do Mapa, onde so um valor guia o que e buscado
 * (2026-08-23: antes era um <select> nativo, ruim de usar com 121 macros ou
 * 5.570 municipios pra rolar).
 */
export function SingleSelectFilter({ placeholder, options, value, onChange, clearLabel, minWidth = 260 }: SingleSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch('');
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = options.filter((o) => normalizarTexto(o.label).includes(normalizarTexto(search)));
  const selecionado = options.find((o) => o.value === value);

  function escolher(v: string | null) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '7px 14px',
          borderRadius: 6,
          fontSize: 12.5,
          fontWeight: 500,
          cursor: 'pointer',
          border: `1.5px solid ${value || open ? colors.primary : colors.border}`,
          background: value ? colors.primaryLight : open ? '#f0f4ff' : '#fff',
          color: value || open ? colors.primary : '#16213e',
          minWidth,
          // Teto de largura -- sem isso o botao crescia sem limite pra
          // caber o rotulo inteiro (nome de macro real pode passar de 45
          // caracteres, ex.: "BA · 2919 · MACRORREGIAO III -
          // SERTAO/ALTO SERTAO"), e o ellipsis do <span> abaixo nunca
          // entrava em acao -- item flex tem min-width:auto por padrao,
          // entao sem essa largura maxima ele so empurrava o botao pra
          // caber o texto todo em vez de truncar (bug real corrigido
          // 2026-08-24, achado numa rodada de QA).
          maxWidth: Math.max(minWidth, 320),
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {selecionado?.label ?? placeholder}
        </span>
        <span style={{ flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            // Leaflet usa z-index ate ~1000 nos proprios controles/panes
            // (ver .leaflet-top/.leaflet-control no leaflet.css) -- o mapa
            // logo abaixo desse seletor tampava o painel de busca com
            // z-index baixo. 1000 nao bastava dependendo do zoom/tile pane;
            // usa uma margem folgada.
            zIndex: 2000,
            background: '#fff',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            minWidth: Math.max(minWidth, 260),
            maxWidth: 420,
            padding: '8px 0',
            marginTop: 4,
          }}
        >
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #f0f1f5' }}>
            <input
              ref={inputRef}
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
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {clearLabel && (
              <div
                onClick={() => escolher(null)}
                style={{
                  padding: '7px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: value ? '#475066' : colors.primary,
                  fontWeight: value ? 400 : 600,
                  borderBottom: '1px solid #f0f1f5',
                }}
              >
                {clearLabel}
              </div>
            )}
            {filtered.map((opt) => (
              <div
                key={opt.value}
                onClick={() => escolher(opt.value)}
                style={{
                  padding: '7px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: opt.value === value ? colors.primary : '#16213e',
                  fontWeight: opt.value === value ? 600 : 400,
                  background: opt.value === value ? colors.primaryLight : 'transparent',
                }}
              >
                {opt.label}
              </div>
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
