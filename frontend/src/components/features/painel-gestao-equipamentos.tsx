import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  COR_EM_OPERACAO,
  COR_ENTREGUE,
  COR_PLANEJADO,
  LEGENDA_OPERACAO,
  totaisOperacao,
  type FamiliaOperacao,
} from "@/lib/painel-gestao-operacao";
import { LegendaSegmentos } from "@/components/features/painel-gestao-colunas";

const LIMITE = 8;

/** Equipamentos por tipo: em operação, entregues (precisam de inauguração) e o restante planejado. */
export function PainelGestaoEquipamentos({
  familias: todas,
}: {
  familias: FamiliaOperacao[];
}) {
  const familias = todas
    .filter((f) => f.planejado > 0)
    .sort(
      (a, b) =>
        b.operacao + b.entregue - (a.operacao + a.entregue) ||
        b.planejado - a.planejado ||
        a.familia.localeCompare(b.familia),
    );
  const [todos, setTodos] = useState(false);
  const { operacao, entregue, restante } = totaisOperacao(familias);
  const maximo = Math.max(1, ...familias.map((f) => f.planejado));
  const visiveis = todos ? familias : familias.slice(0, LIMITE);
  return (
    <section className="h-full rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="m-0 text-base font-semibold tracking-tight">
          Equipamentos por tipo
        </h3>
        <p className="m-0 text-sm tabular-nums text-muted-foreground">
          <strong className="font-display text-xl font-semibold text-foreground">
            {entregue}
          </strong>{" "}
          entregues · {operacao} em operação · {restante} planejados
        </p>
      </div>
      {familias.length === 0 ? (
        <p className="mt-4 mb-0 text-sm text-muted-foreground">
          Nenhum equipamento com controle por unidade nos instrumentos
          monitorados.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <LegendaSegmentos itens={LEGENDA_OPERACAO} />
          </div>
          <ul className="m-0 list-none space-y-3 p-0">
            {visiveis.map((f) => (
              <li
                key={f.familia}
                title={`${f.familia}: ${f.operacao} em operação, ${f.entregue} entregues a inaugurar, ${f.planejado - f.operacao - f.entregue} planejados`}
                className="grid grid-cols-[minmax(0,7rem)_minmax(2rem,1fr)_6.5rem] items-center gap-2 p-1 text-sm xl:grid-cols-[minmax(0,11rem)_1fr_6.5rem] xl:gap-3"
              >
                <span className="leading-tight">{f.familia}</span>
                <div
                  className="h-3 overflow-hidden rounded-full bg-secondary"
                  aria-hidden="true"
                >
                  <div
                    className="flex h-full overflow-hidden rounded-full"
                    style={{
                      width: `${(100 * f.planejado) / maximo}%`,
                      backgroundColor: COR_PLANEJADO,
                    }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${(100 * f.operacao) / f.planejado}%`,
                        backgroundColor: COR_EM_OPERACAO,
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${(100 * f.entregue) / f.planejado}%`,
                        backgroundColor: COR_ENTREGUE,
                      }}
                    />
                  </div>
                </div>
                <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                  {f.operacao} ·{" "}
                  <strong className="font-semibold text-foreground">
                    {f.entregue}
                  </strong>{" "}
                  · {f.planejado - f.operacao - f.entregue}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {familias.length > LIMITE && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTodos((v) => !v)}
          >
            {todos ? "Mostrar menos" : `Mostrar todos (${familias.length})`}
          </Button>
        </div>
      )}
    </section>
  );
}
