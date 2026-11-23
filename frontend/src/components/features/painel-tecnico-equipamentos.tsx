import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FamiliaEntregue } from "@/lib/equipamentos-entregues";

const LIMITE = 8;

/** Equipamentos planejados e entregues por tipo (família) nos instrumentos monitorados da região. */
export function SecaoEquipamentos({
  familias: todasFamilias,
}: {
  familias: FamiliaEntregue[];
}) {
  const familias = todasFamilias.filter((f) => f.planejado > 0);
  const [todas, setTodas] = useState(false);
  const planejado = familias.reduce((t, f) => t + f.planejado, 0);
  const entregue = familias.reduce((t, f) => t + f.entregue, 0);
  const maximo = Math.max(1, ...familias.map((f) => f.planejado));
  const visiveis = todas ? familias : familias.slice(0, LIMITE);
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="m-0 text-base font-semibold tracking-tight">
          Equipamentos por tipo
        </h3>
        <p className="m-0 text-sm tabular-nums text-muted-foreground">
          <strong className="font-display text-xl font-semibold text-foreground">
            {entregue}
          </strong>{" "}
          entregues de{" "}
          <strong className="font-semibold text-foreground">{planejado}</strong>{" "}
          planejados
        </p>
      </div>
      {familias.length === 0 ? (
        <p className="mt-4 mb-0 text-sm text-muted-foreground">
          Nenhum equipamento com controle por unidade nos instrumentos
          monitorados.
        </p>
      ) : (
        <ul className="m-0 mt-5 list-none space-y-3 p-0">
          {visiveis.map((f) => (
            <li
              key={f.familia}
              className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_5rem]"
              title={`${f.familia}: ${f.entregue} entregues de ${f.planejado} planejados`}
            >
              <span className="truncate">{f.familia}</span>
              <div
                className="h-3 overflow-hidden rounded-full bg-secondary"
                aria-hidden="true"
              >
                <div
                  className="relative h-full rounded-full bg-primary/25"
                  style={{ width: `${(100 * f.planejado) / maximo}%` }}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                    style={{
                      width: `${f.planejado > 0 ? (100 * f.entregue) / f.planejado : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-right font-semibold tabular-nums">
                {f.entregue}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  / {f.planejado}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {familias.length > LIMITE && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTodas((v) => !v)}
          >
            {todas ? "Mostrar menos" : `Mostrar todos (${familias.length})`}
          </Button>
        </div>
      )}
    </section>
  );
}
