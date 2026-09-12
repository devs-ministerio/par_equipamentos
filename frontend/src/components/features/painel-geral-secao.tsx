import type { ReactNode } from 'react';
import { colors } from '@/styles/tokens';

export function PainelGeralSecao({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#16213e' }}>{titulo}</div>
      {subtitulo && <div style={{ fontSize: 13, color: colors.mutedText, marginTop: 4, maxWidth: 720 }}>{subtitulo}</div>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}
