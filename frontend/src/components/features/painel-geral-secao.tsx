import type { ReactNode } from 'react';

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
    <div className="mt-9">
      <div className="text-lg font-extrabold text-[#16213e]">{titulo}</div>
      {subtitulo && <div className="mt-1 max-w-[720px] text-[13px] text-muted-foreground">{subtitulo}</div>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
