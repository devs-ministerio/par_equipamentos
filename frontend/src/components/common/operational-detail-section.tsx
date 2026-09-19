import type { ReactNode } from 'react';

/** Bloco de detalhe operacional com agrupamento progressivo (Seção
 * "Operational detail" do plan-mode -- achado: página de detalhe do
 * instrumento é "muito longa sem índice local ou agrupamento
 * progressivo"). `<details>` nativo -- Escape/Enter/teclado de graça, sem
 * dependência nova (Radix accordion seria mais peso pra mesma necessidade
 * aqui: 1 seção aberta/fechada por vez, sem múltiplos painéis
 * coordenados). Migrado pra `monitoramento-instrumento-page.tsx` na
 * Etapa 7, ainda não aplicado. */
export function OperationalDetailSection({
  titulo,
  abertoPorPadrao = true,
  children,
}: {
  titulo: string;
  abertoPorPadrao?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={abertoPorPadrao} className="group border-t border-border py-4">
      <summary className="cursor-pointer list-none font-display text-base font-semibold text-foreground marker:content-none">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>
        {titulo}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
