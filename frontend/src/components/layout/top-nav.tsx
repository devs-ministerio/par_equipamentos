import { useEffect, useRef, useState } from 'react';
import { useFamiliaEquipamento } from '../../context/familia-equipamento-context';
import { colors } from '../../styles/tokens';
import { EQUIPAMENTOS } from '../../data/constants';

/** Seletor de familia de equipamento -- troca a familia lida por
 * Dashboard/Mapa/Relatorios inteiras (via FamiliaEquipamentoContext).
 * TOMOGRAFO e RESSONANCIA tem pipeline/dado real hoje; as demais aparecem
 * desabilitadas pra deixar claro que o escopo maior do projeto ja esta
 * desenhado, sem virar link morto.
 *
 * Vive sozinho neste arquivo (nome do arquivo mantido por historico) desde
 * 2026-09-11 -- a barra de navegação em si (Dashboard/Mapa/Relatórios)
 * virou o header unificado `AppHeader.tsx`, usado em `AppLayout.tsx` com
 * este componente como `leftExtra`. */
export function SeletorEquipamento() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { familia, setFamilia } = useFamiliaEquipamento();
  const atual = EQUIPAMENTOS.find((eq) => eq.familia === familia) ?? EQUIPAMENTOS[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          height: 32,
          border: `1px solid ${colors.topbarBorder}`,
          borderRadius: 6,
          background: '#fff',
          color: colors.primaryDark,
          fontWeight: 600,
          fontSize: 13,
          padding: '0 12px',
          cursor: 'pointer',
        }}
      >
        {atual.rotulo} ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            background: '#fff',
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            minWidth: 200,
            zIndex: 20,
            padding: '4px 0',
            marginTop: 4,
          }}
        >
          {EQUIPAMENTOS.map((eq) => (
            <div
              key={eq.familia}
              title={eq.disponivel ? undefined : 'Em breve'}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
                background: eq.familia === atual.familia ? colors.primaryLight : 'transparent',
                border: 'none',
                color: eq.disponivel ? (eq.familia === atual.familia ? colors.primary : '#475066') : colors.subtleText,
                fontSize: 13,
                fontWeight: eq.familia === atual.familia ? 600 : 400,
                padding: '8px 14px',
                cursor: eq.disponivel ? 'pointer' : 'not-allowed',
              }}
              onClick={() => {
                if (!eq.disponivel) return;
                setFamilia(eq.familia);
                setOpen(false);
              }}
            >
              {eq.rotulo}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
