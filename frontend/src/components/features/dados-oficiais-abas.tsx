import { cn } from "@/lib/utils";
import { ESTAGIO_LABEL, type EstagioProposta } from "@/lib/proposta-status";

export function AbasDadosOficiais({
  aba,
  totalInstrumentos,
  totalPropostas,
  onChange,
}: {
  aba: "convenios" | "componentes";
  totalInstrumentos: number;
  totalPropostas: number;
  onChange: (aba: "convenios" | "componentes") => void;
}) {
  return (
    <div className="mb-5 flex gap-1 border-b border-border">
      {(
        [
          {
            value: "convenios",
            label: "Instrumentos/Programas",
            total: totalInstrumentos,
          },
          {
            value: "componentes",
            label: "Linhas de financiamento",
            total: totalPropostas,
          },
        ] as const
      ).map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "border-none border-b-2 bg-transparent px-4 py-2.5 text-sm font-bold -mb-px cursor-pointer",
            aba === item.value
              ? "border-b-primary text-primary"
              : "border-b-transparent text-muted-foreground",
          )}
        >
          {item.label}{" "}
          <span className="font-medium text-muted-foreground/70">
            ({item.total})
          </span>
        </button>
      ))}
    </div>
  );
}

export function SubAbasFinanciamento({
  atual,
  confirmadas,
  emTramitacao,
  onChange,
}: {
  atual: EstagioProposta;
  confirmadas: number;
  emTramitacao: number;
  onChange: (estagio: EstagioProposta) => void;
}) {
  return (
    <div className="mb-4 flex gap-1 border-b border-border">
      {(
        [
          { value: "confirmada", total: confirmadas },
          { value: "tramitacao", total: emTramitacao },
        ] as const
      ).map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn(
            "border-none border-b-2 bg-transparent px-3.5 py-2 text-[12.5px] font-semibold -mb-px cursor-pointer",
            atual === item.value
              ? "border-b-primary text-primary"
              : "border-b-transparent text-muted-foreground",
          )}
        >
          {ESTAGIO_LABEL[item.value]}{" "}
          <span className="ml-1 font-medium text-muted-foreground/70">
            ({item.total})
          </span>
        </button>
      ))}
    </div>
  );
}
