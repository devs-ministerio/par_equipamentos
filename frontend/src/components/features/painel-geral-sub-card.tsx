import type { ReactNode } from "react";

/** Painel encaixado dentro do card da familia (2026-08-22) -- fundo
 * ligeiramente diferente do card branco que o contem, pra criar separacao
 * visual real ("card dentro do card") em vez de tudo ser texto pequeno
 * empilhado sem hierarquia. `flex: '0 0 auto'` (nao '1 1 auto') e proposital
 * -- CardFamilia e uma coluna flex, e os dois cards de familia lado a lado
 * tem a MESMA altura (grid `align-items: stretch`, ver PainelGeralPage);
 * sem isso, cada SubCard crescia pra preencher a sobra vertical quando um
 * card ficava mais alto que o outro, sobrando espaco vazio dentro da caixa
 * em vez de deixar o conteudo ditar a altura (bug real, 2026-08-22). */
export function PainelGeralSubCard({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-none rounded-xl border border-border bg-background px-[18px] py-4">
      <div className="mb-[13px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground/70">
        {titulo}
      </div>
      {children}
    </div>
  );
}
