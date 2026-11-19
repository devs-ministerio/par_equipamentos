/** Seção "Fase geral": passos da fase oficial (calculada) do instrumento. */
import type { ReactNode } from "react";
import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { cn } from "@/lib/utils";
import { SecaoOperacional } from "./monitoramento-ui";

export function MonitoramentoInternoFaseGeral({
  faseAtual,
  acao,
}: {
  faseAtual: string | null | undefined;
  /** Ação do cabeçalho do cartão (concluir ou reabrir o acompanhamento). */
  acao?: ReactNode;
}) {
  const indiceAtual = Math.max(
    FASES_ACOMPANHAMENTO.findIndex((f) => f === faseAtual),
    0,
  );
  const concluido = FASES_ACOMPANHAMENTO[indiceAtual] === "Concluído";
  return (
    <SecaoOperacional titulo="Fase geral" cartao acao={acao}>
      <p className="m-0 mb-3 text-sm">
        <strong>{FASES_ACOMPANHAMENTO[indiceAtual]}</strong>
        <span className="text-muted-foreground">
          {" "}
          · etapa {indiceAtual + 1} de {FASES_ACOMPANHAMENTO.length}
        </span>
      </p>
      <ol className="m-0 flex list-none p-0">
        {FASES_ACOMPANHAMENTO.map((rotulo, i) => {
          const atual = i === indiceAtual;
          const feita = i < indiceAtual || (atual && concluido);
          return (
            <li
              key={rotulo}
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
                  atual &&
                    !feita &&
                    "border-primary bg-primary text-primary-foreground",
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
                {rotulo}
              </span>
            </li>
          );
        })}
      </ol>
    </SecaoOperacional>
  );
}
