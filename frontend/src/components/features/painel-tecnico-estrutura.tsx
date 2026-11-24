import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ItemNavegacao {
  id: string;
  rotulo: string;
}

/** Bloco da página com título de seção e âncora para a navegação lateral. */
export function PainelBloco({
  id,
  titulo,
  children,
  className,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={cn("scroll-mt-28 space-y-5", className)}
    >
      <h2
        id={`${id}-titulo`}
        className="m-0 font-display text-xl font-semibold tracking-tight text-foreground"
      >
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Atalhos fixos sob o cabeçalho; marca a seção que está na tela. */
export function PainelNavegacao({ itens }: { itens: ItemNavegacao[] }) {
  const [ativo, setAtivo] = useState(itens[0]?.id);
  useEffect(() => {
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.find((e) => e.isIntersecting);
        if (visivel) setAtivo(visivel.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const { id } of itens) {
      const el = document.getElementById(id);
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [itens]);
  return (
    <nav
      aria-label="Seções do painel"
      className="sticky top-14 z-30 -mx-1 mb-8 flex gap-1 overflow-x-auto border-b border-border/70 bg-background/85 px-1 py-2 backdrop-blur-md"
    >
      {itens.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={ativo === item.id ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById(item.id)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
            setAtivo(item.id);
          }}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
            ativo === item.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.rotulo}
        </a>
      ))}
    </nav>
  );
}
