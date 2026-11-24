import { ChipsFiltrosAtivos, type RecortePainel } from "./chips-filtros-ativos";
import { ApresentacaoFiltros, type Controle } from "./controles-filtro";

/** Barra de filtros de página no padrão do Painel de gestão: botões com popover, etiquetas removíveis e contagem. */
export function BarraFiltros({
  controles,
  recortes,
  onLimpar,
  contagem,
  rotulo,
}: {
  controles: Controle[];
  recortes: RecortePainel[];
  onLimpar: () => void;
  contagem?: string;
  rotulo: string;
}) {
  return (
    <div className="@container mb-5 space-y-2 rounded-xl border border-border bg-card p-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ApresentacaoFiltros
          controles={controles}
          rotuloGrupo={rotulo}
          className="hidden min-w-0 flex-wrap items-center gap-0.5 @min-[640px]:flex"
          classeSheet="shrink-0 @min-[640px]:hidden"
        />
        {contagem && (
          <span className="ml-auto text-xs text-muted-foreground">
            {contagem}
          </span>
        )}
      </div>
      <ChipsFiltrosAtivos recortes={recortes} limpar={onLimpar} />
    </div>
  );
}
