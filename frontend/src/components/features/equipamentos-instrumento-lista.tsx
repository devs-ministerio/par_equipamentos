/** Um cartão por item controlado: planejado x entregue, situação e unidades. */
import { useState } from "react";
import { fmtData } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";
import type {
  ItemEquipamento,
  UnidadeEquipamento,
} from "@/services/entregas-equipamento";
import { ConfirmarExclusaoComMotivo, estiloInput } from "./monitoramento-ui";

const SITUACAO: Record<ItemEquipamento["situacao"], [string, string]> = {
  pendente: ["Pendente", "bg-warning-bg text-warning border-warning/20"],
  parcial: ["Parcial", "bg-warning-bg text-warning border-warning/20"],
  entregue: ["Entregue", "bg-success-bg text-success border-success/20"],
  legado_a_revisar: [
    "Entrega a vincular",
    "bg-destructive-bg text-destructive border-destructive/20",
  ],
};

const botao = cn(
  estiloInput,
  "cursor-pointer bg-transparent text-primary border border-primary font-semibold py-1 px-2.5",
);

export function EquipamentosInstrumentoLista({
  itens,
  podeEditar,
  onRegistrar,
  onCorrigir,
  onExcluirEntrega,
}: {
  itens: ItemEquipamento[];
  podeEditar: boolean;
  onRegistrar: (itemId: number) => void;
  onCorrigir: (unidade: UnidadeEquipamento) => void;
  onExcluirEntrega: (entregaId: number, motivo: string) => Promise<void>;
}) {
  const [excluindo, setExcluindo] = useState<number | null>(null);
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {itens.map((item) => {
        const [rotulo, classes] = SITUACAO[item.situacao];
        const completo = item.situacao === "entregue";
        return (
          <li key={item.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <strong className="min-w-0 flex-1 break-words text-[13px]">
                {item.descricao}
                {item.codigo_item && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    ({item.codigo_item})
                  </span>
                )}
              </strong>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-[3px] text-[10.5px] font-bold",
                  classes,
                )}
              >
                {rotulo}
              </span>
              <span className="text-[12.5px] tabular-nums">
                {item.quantidade_entregue} de {item.quantidade_planejada ?? "?"}{" "}
                entregue(s)
              </span>
              {podeEditar && !completo && (
                <button
                  type="button"
                  className={botao}
                  onClick={() => onRegistrar(item.id)}
                >
                  Registrar entrega
                </button>
              )}
            </div>
            {item.ultima_entrega && (
              <p className="m-0 mt-1 text-[11.5px] text-muted-foreground">
                Última entrega em {fmtData(item.ultima_entrega)}
              </p>
            )}
            {item.unidades.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] font-semibold">
                  Unidades ({item.unidades.length})
                </summary>
                <ul className="m-0 mt-1.5 grid list-none gap-1.5 p-0">
                  {item.unidades.map((u) => (
                    <li
                      key={u.id}
                      className="border-t border-border pt-1.5 text-[12.5px]"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Unidade {u.ordem}</span>
                        <span>
                          {[u.marca, u.modelo].filter(Boolean).join(" / ") ||
                            "marca e modelo não informados"}
                        </span>
                        <span>Série: {u.numero_serie ?? "—"}</span>
                        <span>
                          Vida útil:{" "}
                          {u.vida_util_anos != null
                            ? `${u.vida_util_anos} anos`
                            : "—"}
                        </span>
                        <span className="text-muted-foreground">
                          Entrega de {fmtData(u.data_entrega)}
                        </span>
                        {podeEditar && (
                          <>
                            <button
                              type="button"
                              className={botao}
                              onClick={() => onCorrigir(u)}
                            >
                              Corrigir
                            </button>
                            <button
                              type="button"
                              className={botao}
                              onClick={() => setExcluindo(u.entrega_id)}
                            >
                              Excluir entrega
                            </button>
                          </>
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
            )}
          </li>
        );
      })}
    </ul>
  );
}
