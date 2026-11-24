import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ESPACO_ABAIXO_DO_CABECALHO = 3;

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
  ocultarTitulo = false,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
  className?: string;
  /** Primeira seção: a aba ativa já diz onde está; o título fica só para leitor de tela. */
  ocultarTitulo?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={cn("scroll-mt-36 space-y-6", className)}
    >
      <header
        className={cn(
          "relative border-b border-border pb-4",
          ocultarTitulo && "sr-only",
        )}
      >
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
export function PainelNavegacao({
  itens,
  filtros,
}: {
  itens: ItemNavegacao[];
  filtros?: ReactNode;
}) {
  const [ativo, setAtivo] = useState(itens[0]?.id);
  const [alturaCabecalho, setAlturaCabecalho] = useState(65);
  useEffect(() => {
    const cabecalho = document.querySelector("header.sticky");
    if (!cabecalho || typeof ResizeObserver === "undefined") return;
    const medir = () =>
      setAlturaCabecalho(Math.round(cabecalho.getBoundingClientRect().height));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(cabecalho);
    return () => observador.disconnect();
  }, []);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
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
    <div
      style={{ top: alturaCabecalho + ESPACO_ABAIXO_DO_CABECALHO }}
      className="@container sticky z-30 rounded-xl border border-border bg-card p-2 shadow-sm"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <nav
          aria-label="Seções do painel"
          className="flex min-w-0 gap-1 overflow-x-auto"
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
                "shrink-0 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors",
                ativo === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.rotulo}
            </a>
          ))}
        </nav>
        {filtros}
      </div>
    </div>
  );
}
