/** Equipamentos entregues x planejados por família, no recorte do painel. */
import type { FamiliaEntregue } from "@/lib/equipamentos-entregues";

export function MonitoramentoPainelEntregues({
  familias,
}: {
  familias: FamiliaEntregue[];
}) {
  if (familias.length === 0) {
    return (
      <p className="m-0 text-xs text-muted-foreground">
        Nenhuma entrega registrada por unidade no recorte.
      </p>
    );
  }
  return (
    <ul className="m-0 list-none divide-y divide-border p-0">
      {familias.map((f) => (
        <li
          key={f.familia}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-xs"
        >
          <span className="truncate" title={f.familia}>
            {f.familia}
          </span>
          <span className="font-semibold tabular-nums">
            {f.entregue}
            <span className="font-normal text-muted-foreground">
              {" "}
              / {f.planejado}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
