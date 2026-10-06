import type { ReactNode } from "react";
import type { StatusCobertura } from "@/types/domain";
import { StatusBadge } from "@/components/common/status-badge";

interface Props {
  nome: string;
  contexto: string;
  populacao: number;
  coeficiente: string;
  oferta: string;
  status: StatusCobertura;
  corTexto: string;
  acao?: ReactNode;
  expandida?: boolean;
  onToggle?: () => void;
}

export function CoberturaMobileCard({
  nome,
  contexto,
  populacao,
  coeficiente,
  oferta,
  status,
  corTexto,
  acao,
  expandida,
  onToggle,
}: Props) {
  const titulo = (
    <>
      <span className="min-w-0 flex-1 break-words text-left text-sm font-semibold text-foreground">
        {nome}
      </span>
      {onToggle && (
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          {expandida ? "−" : "+"}
        </span>
      )}
    </>
  );

  return (
    <div className="min-w-0 space-y-3 px-4 py-3">
      <div className="min-w-0">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expandida}
            className="flex min-h-11 w-full items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {titulo}
          </button>
        ) : (
          <div className="flex min-h-11 items-center gap-3">{titulo}</div>
        )}
        <p className="break-words text-xs text-muted-foreground">{contexto}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">
            População SUS-dep.
          </div>
          <div className="text-sm font-medium tabular-nums">
            {populacao.toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">Cobertura</div>
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: corTexto }}
          >
            {coeficiente}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-xs text-muted-foreground">{oferta}</p>
          <StatusBadge status={status} />
        </div>
        {acao}
      </div>
    </div>
  );
}
