/** Tabela de itens controlados: planejado x entregue, situação e unidades.
 * Grade que vira lista empilhada em tela estreita. */
import { Check, Menu } from "lucide-react";
import { useState } from "react";
import { fmtData } from "@/lib/monitoramento-format";
import { nomeSemCodigo, posicaoEntreIguais } from "@/lib/equipamento-rotulos";
import { cn } from "@/lib/utils";
import type {
  ItemEquipamento,
  UnidadeEquipamento,
} from "@/services/entregas-equipamento";
import {
  EquipamentosInstrumentoUnidades,
  botaoIcone,
} from "./equipamentos-instrumento-unidades";

const SITUACAO: Record<ItemEquipamento["situacao"], [string, string]> = {
  pendente: ["Pendente", "bg-warning-bg text-warning border-warning/20"],
  parcial: ["Parcial", "bg-warning-bg text-warning border-warning/20"],
  entregue: ["Entregue", "bg-success-bg text-success border-success/20"],
  legado_a_revisar: [
    "A vincular",
    "bg-destructive-bg text-destructive border-destructive/20",
  ],
};

const COLUNAS =
  "md:grid-cols-[minmax(0,1fr)_7.5rem_6.5rem_6.5rem_5rem] md:items-center";

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
  const [verUnidades, setVerUnidades] = useState<number | null>(null);
  const posicoes = posicaoEntreIguais(itens);
  const itemAberto = itens.find((i) => i.id === verUnidades);
  return (
    <div>
      <div
        aria-hidden="true"
        className={cn(
          "hidden gap-3 border-b border-border pb-2 text-[10.5px] font-bold uppercase tracking-[.03em] text-muted-foreground md:grid",
          COLUNAS,
        )}
      >
        <span>Equipamento</span>
        <span>Entregue</span>
        <span>Situação</span>
        <span>Última</span>
        <span />
      </div>
      {itens.map((item) => {
        const [rotulo, classes] = SITUACAO[item.situacao];
        const nome = nomeSemCodigo(item.descricao);
        const posicao = posicoes.get(item.id);
        const planejado = item.quantidade_planejada;
        const pct = planejado
          ? Math.min(100, (item.quantidade_entregue / planejado) * 100)
          : 0;
        return (
          <div
            key={item.id}
            role="group"
            aria-label={nome}
            className="border-b border-border py-3 last:border-b-0"
          >
            <div className={cn("grid grid-cols-2 gap-x-3 gap-y-2", COLUNAS)}>
              <div className="col-span-2 min-w-0 md:col-span-1">
                <div className="break-words text-[13px] font-semibold">
                  {nome}
                  {posicao && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      · item {posicao}
                    </span>
                  )}
                </div>
                {item.codigo_item && (
                  <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-px font-mono text-[10.5px] text-muted-foreground">
                    {item.codigo_item}
                  </span>
                )}
              </div>
              <div
                className="text-[12.5px] tabular-nums"
                aria-label={`${item.quantidade_entregue} de ${planejado ?? "quantidade desconhecida"} entregue`}
              >
                <span className="font-semibold">
                  {item.quantidade_entregue}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  / {planejado ?? "?"}
                </span>
                <div
                  className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div>
                <span
                  className={cn(
                    "inline-block rounded-full border px-2.5 py-[3px] text-[10.5px] font-bold",
                    classes,
                  )}
                >
                  {rotulo}
                </span>
              </div>
              <div className="text-[12px] text-muted-foreground">
                {item.ultima_entrega ? fmtData(item.ultima_entrega) : "—"}
              </div>
              <div className="flex justify-end gap-1.5 md:justify-self-end">
                {item.unidades.length > 0 && (
                  <button
                    type="button"
                    className={botaoIcone}
                    aria-label={`Ver unidades de ${nome}`}
                    title="Unidades"
                    onClick={() => setVerUnidades(item.id)}
                  >
                    <Menu className="size-4" aria-hidden="true" />
                  </button>
                )}
                {podeEditar && item.situacao !== "entregue" && (
                  <button
                    type="button"
                    className={botaoIcone}
                    aria-label={`Registrar entrega de ${nome}`}
                    title="Registrar entrega"
                    onClick={() => onRegistrar(item.id)}
                  >
                    <Check className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {itemAberto && (
        <EquipamentosInstrumentoUnidades
          nome={nomeSemCodigo(itemAberto.descricao)}
          unidades={itemAberto.unidades}
          podeEditar={podeEditar}
          onFechar={() => setVerUnidades(null)}
          onCorrigir={onCorrigir}
          onExcluirEntrega={onExcluirEntrega}
        />
      )}
    </div>
  );
}
