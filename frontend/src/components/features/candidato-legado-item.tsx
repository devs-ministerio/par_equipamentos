import { Badge } from "@/components/ui/badge";
import { ROTULOS_CONFIRMACAO, ROTULOS_RELACAO } from "@/lib/legado-rotulos";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { estiloCard } from "./monitoramento-ui";

/** Texto original e proveniência permanecem acessíveis sem alongar a fila. */
export function CandidatoLegadoItem({
  candidato,
}: {
  candidato: CandidatoLegado;
}) {
  const equipamentos = [...new Set(candidato.evidencias.map((e) => e.nome))];
  return (
    <li
      className={`${estiloCard} min-w-0 border-l-[3px] border-l-primary [overflow-wrap:anywhere]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tight">
          Convênio {candidato.numero}
        </h3>
        <Badge
          variant="outline"
          className="max-w-full whitespace-normal text-xs"
        >
          {ROTULOS_CONFIRMACAO[candidato.confirmacao_portal]}
        </Badge>
      </div>
      <p className="mt-2 text-sm font-medium">{equipamentos.join(" · ")}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Proposta {candidato.id_proposta}</span>
        <span>
          {candidato.evidencias.length}{" "}
          {candidato.evidencias.length === 1 ? "evidência" : "evidências"}
        </span>
        {candidato.origem === "snapshot_local" && (
          <span>Snapshot local · frescor não confirmado</span>
        )}
      </div>
      <details className="mt-3">
        <summary className="w-fit cursor-pointer text-xs font-semibold text-primary transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Ver evidências
        </summary>
        <div className="mt-3 border-l-2 border-border pl-4">
          <ul className="space-y-4">
            {candidato.evidencias.map((e) => (
              <li key={`${e.id_item}-${e.codigo}`}>
                <p className="text-xs font-medium">
                  {ROTULOS_RELACAO[e.relacao]} · Item {e.id_item}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {e.descricao}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            {candidato.origem === "snapshot_local"
              ? "Snapshot local"
              : "Captura do SICONV"}{" "}
            · Verificado em{" "}
            {new Date(candidato.verificado_em).toLocaleString("pt-BR")}
          </p>
        </div>
      </details>
    </li>
  );
}
