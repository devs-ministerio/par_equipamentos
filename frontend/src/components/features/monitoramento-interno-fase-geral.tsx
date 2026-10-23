/** Seção "Fase geral": passos da fase atual do instrumento. */
import { cn } from "@/lib/utils";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import { SecaoOperacional } from "./monitoramento-ui";

export function MonitoramentoInternoFaseGeral({
  fasesGerais,
  faseAtual,
  pctAtual,
}: {
  fasesGerais: MarcoCatalogo[];
  faseAtual: MarcoCatalogo | undefined;
  pctAtual: number;
}) {
  const indiceAtual = fasesGerais.findIndex((f) => f.id === faseAtual?.id);
  return (
    <SecaoOperacional titulo="Fase geral" cartao>
      <p className="m-0 mb-3 text-sm">
        <strong>{faseAtual?.rotulo ?? "Não iniciado"}</strong>
        <span className="text-muted-foreground">
          {" "}
          · etapa {Math.max(indiceAtual + 1, 0)} de {fasesGerais.length} ·{" "}
          {Math.round(pctAtual * 100)}%
        </span>
      </p>
      <ol className="m-0 flex list-none p-0">
        {fasesGerais.map((f, i) => {
          const feita = i < indiceAtual;
          const atual = i === indiceAtual;
          return (
            <li
              key={f.id}
              aria-current={atual ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center"
            >
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[-50%] top-[9px] h-0.5 w-full",
                    i <= indiceAtual ? "bg-success" : "bg-border",
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 grid size-5 place-items-center rounded-full border-2 text-[10px] font-bold",
                  atual && "border-primary bg-primary text-primary-foreground",
                  feita && "border-success bg-success text-success-foreground",
                  !atual && !feita && "border-border bg-card",
                )}
              >
                {feita ? "✓" : ""}
              </span>
              <span
                className={cn(
                  "mt-1.5 px-0.5 text-center text-[10.5px] leading-tight",
                  atual
                    ? "font-semibold text-foreground"
                    : "hidden text-muted-foreground lg:block",
                )}
              >
                {f.rotulo}
              </span>
            </li>
          );
        })}
      </ol>
    </SecaoOperacional>
  );
}
