/** Unidades entregues de um item, com correção e exclusão da entrega. */
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { fmtData } from "@/lib/monitoramento-format";
import type { UnidadeEquipamento } from "@/services/entregas-equipamento";
import { ConfirmarExclusaoComMotivo } from "./monitoramento-ui";

export const botaoIcone =
  "inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function EquipamentosInstrumentoUnidades({
  nome,
  unidades,
  podeEditar,
  onCorrigir,
  onExcluirEntrega,
}: {
  nome: string;
  unidades: UnidadeEquipamento[];
  podeEditar: boolean;
  onCorrigir: (unidade: UnidadeEquipamento) => void;
  onExcluirEntrega: (entregaId: number, motivo: string) => Promise<void>;
}) {
  const [excluindo, setExcluindo] = useState<number | null>(null);
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-primary">
        Unidades ({unidades.length})
      </summary>
      <ul className="m-0 mt-2 grid list-none gap-1 p-0">
        {unidades.map((u) => (
          <li
            key={u.id}
            className="rounded-md bg-muted/40 px-3 py-2 text-[12.5px]"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <strong>#{u.ordem}</strong>
              <span>
                {[u.marca, u.modelo].filter(Boolean).join(" · ") ||
                  "Sem marca/modelo"}
              </span>
              <span>Série: {u.numero_serie ?? "—"}</span>
              <span>
                Vida útil:{" "}
                {u.vida_util_anos != null ? `${u.vida_util_anos} anos` : "—"}
              </span>
              <span className="text-muted-foreground">
                {fmtData(u.data_entrega)}
              </span>
              {podeEditar && (
                <span className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    className={botaoIcone}
                    aria-label={`Corrigir unidade ${u.ordem} de ${nome}`}
                    title="Corrigir"
                    onClick={() => onCorrigir(u)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={botaoIcone}
                    aria-label={`Excluir entrega da unidade ${u.ordem} de ${nome}`}
                    title="Excluir entrega"
                    onClick={() => setExcluindo(u.entrega_id)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
            {excluindo === u.entrega_id && (
              <ConfirmarExclusaoComMotivo
                onCancelar={() => setExcluindo(null)}
                onExcluir={async (motivo) => {
                  await onExcluirEntrega(u.entrega_id, motivo);
                  setExcluindo(null);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
