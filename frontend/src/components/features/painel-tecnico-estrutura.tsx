import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ItemNavegacao {
  id: string;
  rotulo: string;
}

/** Bloco da página com título de seção (e resumo em dados) e âncora para a navegação fixa. */
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
      className={cn("scroll-mt-36 space-y-6", className)}
    >
      <header className="relative border-b border-border pb-4">
        <h2
          id={`${id}-titulo`}
          className="m-0 font-display text-2xl leading-tight font-bold tracking-[-0.03em] text-foreground sm:text-[1.75rem]"
        >
          {titulo}
        </h2>
        <span
          aria-hidden="true"
          className="absolute -bottom-px left-0 h-0.5 w-14 rounded-full bg-primary"
        />
      </header>
      {children}
    </section>
  );
}

/** Atalhos fixos sob o cabeçalho; marca a seção que está na tela. */
export function PainelNavegacao({ itens }: { itens: ItemNavegacao[] }) {
  const [ativo, setAtivo] = useState(itens[0]?.id);
  const [topo, setTopo] = useState(65);
  useEffect(() => {
    const cabecalho = document.querySelector("header.sticky");
    if (!cabecalho) return;
    const medir = () =>
      setTopo(Math.round(cabecalho.getBoundingClientRect().height));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(cabecalho);
    return () => observador.disconnect();
  }, []);
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
      style={{ top: topo }}
      className="sticky z-30 -mx-1 mb-8 flex gap-1 overflow-x-auto border-b border-border/70 bg-background/85 px-1 py-3 backdrop-blur-md"
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
