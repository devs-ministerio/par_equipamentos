import { StatusPill } from "@/components/features/monitoramento-ui";
import { cn } from "@/lib/utils";
import type { GrupoLinha, LinhaRelatorio } from "@/lib/relatorio-linhas";

const GRUPO_CLASSES: Record<GrupoLinha, string> = {
  Instrumento: "bg-muted text-muted-foreground",
  Confirmada: "bg-success/12 text-success",
  Proposta: "bg-secondary text-primary",
};

/** Tipo da contratação e grupo do registro ("FAF" + "Confirmada"). */
export function EtiquetasDoRegistro({
  linha,
  centralizado = false,
}: {
  linha: LinhaRelatorio;
  centralizado?: boolean;
}) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.04em]";
  return (
    <span
      className={cn(
        "mt-1.5 flex flex-wrap gap-1",
        centralizado && "justify-center",
      )}
    >
      <span className={cn(base, "bg-muted text-foreground")}>
        {linha.tipo ?? "Convênio"}
      </span>
      {linha.grupo !== "Instrumento" && (
        <span className={cn(base, GRUPO_CLASSES[linha.grupo])}>
          {linha.grupo}
        </span>
      )}
    </span>
  );
}

/** Dois primeiros equipamentos; o restante vira "+N" com a lista completa no title. */
export function EquipamentosDaLinha({
  equipamentos,
}: {
  equipamentos: string[];
}) {
  if (equipamentos.length === 0)
    return <span className="text-muted-foreground">—</span>;
  const resto = equipamentos.length - 2;
  return (
    <span title={equipamentos.join(", ")}>
      {equipamentos.slice(0, 2).join(", ")}
      {resto > 0 && (
        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
          +{resto}
        </span>
      )}
    </span>
  );
}

export function SituacaoDaLinha({ texto }: { texto: string | null }) {
  return texto ? (
    <StatusPill texto={texto} />
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}
