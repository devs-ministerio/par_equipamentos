import { useState, type ReactNode } from 'react';

interface InfoIconProps {
  children: ReactNode;
  align?: 'left' | 'right';
}

/** Icone "!" que mostra um popup escuro ao passar o mouse (sem precisar clicar). */
export function InfoIcon({ children, align = 'left' }: InfoIconProps) {
  const [hover, setHover] = useState(false);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: '1.5px solid #98a0b3',
          color: '#98a0b3',
          fontSize: 9,
          fontWeight: 700,
          cursor: 'default',
          lineHeight: 1,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        !
      </span>
      {hover && (
        <div
          style={{
            position: 'absolute',
            top: '120%',
            left: align === 'left' ? '50%' : 'auto',
            right: align === 'right' ? 0 : 'auto',
            transform: align === 'left' ? 'translateX(-50%)' : undefined,
            background: '#16213e',
            color: '#fff',
            borderRadius: 8,
            padding: '12px 14px',
            minWidth: 220,
            maxWidth: 280,
            zIndex: 50,
            fontSize: 12,
            lineHeight: 1.6,
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 0,
            // whiteSpace explicito -- alguns cabecalhos de coluna (ex.:
            // CoberturaTable "Populacao SUS-dependente") usam nowrap no <th>
            // pra rotulo+seta de ordenacao caberem numa linha, e white-space
            // e propriedade herdada: sem isso aqui, o popup herdava nowrap
            // do ancestral e o texto nunca quebrava linha (bug real,
            // 2026-08-24) -- maxWidth sozinho nao resolve esse caso.
            whiteSpace: 'normal',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}
