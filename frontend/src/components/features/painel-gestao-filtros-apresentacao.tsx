import { useState } from "react";
import { ChevronDown, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Controle } from "./painel-gestao-filtros-controles";

export function ControleDesktop({ controle }: { controle: Controle }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 px-2 text-xs text-muted-foreground",
            controle.ativo &&
              "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
        >
          <controle.icone className="size-3.5" aria-hidden="true" />
          {controle.rotulo}
          {controle.ativo && (
            <span
              className="size-1.5 rounded-full bg-current"
              aria-hidden="true"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label={controle.rotulo}
        className="z-[2000] max-h-[var(--radix-popover-content-available-height)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto p-3"
      >
        <p className="px-0.5 text-sm font-semibold">{controle.rotulo}</p>
        {controle.conteudo(() => setAberto(false))}
      </PopoverContent>
    </Popover>
  );
}

/** Os controles em linha (largura grande) e, abaixo dela, no painel "Filtros" de baixo para cima. */
export function ApresentacaoFiltros({ controles }: { controles: Controle[] }) {
  const ativos = controles.filter(({ ativo }) => ativo).length;
  return (
    <>
      <div
        role="group"
        aria-label="Filtros do painel"
        className="hidden shrink-0 items-center gap-0.5 border-l border-border pl-2 @min-[1080px]:flex"
      >
        {controles.map((controle) => (
          <ControleDesktop key={controle.rotulo} controle={controle} />
        ))}
      </div>
      <div className="shrink-0 @min-[1080px]:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Settings2 aria-hidden="true" />
              Filtros
              {ativos > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {ativos}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            aria-describedby={undefined}
            className="max-h-[85dvh] overflow-y-auto rounded-t-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <SheetTitle>Filtros do painel</SheetTitle>
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fechar filtros"
                >
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
            </div>
            <div className="space-y-2 px-4 pb-4">
              {controles.map(({ rotulo, icone: Icone, ativo, conteudo }) => (
                <details
                  key={rotulo}
                  name="filtros-painel"
                  className="group rounded-lg border border-border"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-medium [&::-webkit-details-marker]:hidden">
                    <Icone className="size-4 text-primary" aria-hidden="true" />
                    {rotulo}
                    {ativo && (
                      <span
                        className="size-1.5 rounded-full bg-primary"
                        aria-label="Filtro ativo"
                      />
                    )}
                    <ChevronDown
                      className="ml-auto size-4 text-muted-foreground group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="space-y-3 border-t border-border p-3">
                    {conteudo(() => {})}
                  </div>
                </details>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
