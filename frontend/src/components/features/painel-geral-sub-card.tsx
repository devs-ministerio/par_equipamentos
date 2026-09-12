import type { ReactNode } from 'react';
import { colors } from '@/styles/tokens';

/** Painel encaixado dentro do card da familia (2026-08-22) -- fundo
 * ligeiramente diferente do card branco que o contem, pra criar separacao
 * visual real ("card dentro do card") em vez de tudo ser texto pequeno
 * empilhado sem hierarquia. `flex: '0 0 auto'` (nao '1 1 auto') e proposital
 * -- CardFamilia e uma coluna flex, e os dois cards de familia lado a lado
 * tem a MESMA altura (grid `align-items: stretch`, ver PainelGeralPage);
 * sem isso, cada SubCard crescia pra preencher a sobra vertical quando um
 * card ficava mais alto que o outro, sobrando espaco vazio dentro da caixa
 * em vez de deixar o conteudo ditar a altura (bug real, 2026-08-22). */
export function PainelGeralSubCard({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '16px 18px',
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: colors.subtleText,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 13,
        }}
      >
        {titulo}
      </div>
      {children}
    </div>
  );
}
