import { cn } from "@/lib/utils";
import { ChipsFiltrosAtivos, type RecortePainel } from "./chips-filtros-ativos";
import { ApresentacaoFiltros, type Controle } from "./controles-filtro";

/** Barra de filtros de página no padrão do Painel de gestão: botões com popover que dividem toda a largura do card e etiquetas removíveis. */
export function BarraFiltros({
  controles,
  recortes,
  onLimpar,
  aviso,
  rotulo,
  className,
}: {
  controles: Controle[];
  recortes: RecortePainel[];
  onLimpar: () => void;
  /** Estado da fonte (ex.: monitoramento indisponível); não é contagem de resultados. */
  aviso?: string;
  rotulo: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "@container mb-5 flex flex-col gap-1 rounded-xl border border-border bg-card p-1 shadow-sm",
        className,
      )}
    >
      <ApresentacaoFiltros
        controles={controles}
        rotuloGrupo={rotulo}
        className="hidden w-full min-w-0 items-center gap-1 @min-[640px]:flex"
        classeBotao="h-10 min-w-0 flex-1 justify-center gap-2 text-sm"
        classeSheet="@min-[640px]:hidden"
      />
      <div className="flex flex-col gap-2 px-2 pb-2 empty:hidden">
        {aviso && (
          <p role="status" className="text-xs text-muted-foreground">
            {aviso}
          </p>
        )}
        <ChipsFiltrosAtivos recortes={recortes} limpar={onLimpar} />
      </div>
    </div>
  );
}
