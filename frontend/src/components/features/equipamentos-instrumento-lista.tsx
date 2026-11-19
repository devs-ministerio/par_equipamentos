/** Tabela de itens controlados: planejado x entregue, situação e unidades.
 * Grade que vira lista empilhada em tela estreita. */
import { Ban, CalendarClock, Check, Menu } from "lucide-react";
import { useState } from "react";
import { fmtData } from "@/lib/monitoramento-format";
import { posicaoEntreIguais } from "@/lib/equipamento-rotulos";
import { cn } from "@/lib/utils";
import type {
  ItemEquipamento,
  UnidadeEquipamento,
} from "@/services/entregas-equipamento";
import {
  EquipamentosInstrumentoUnidades,
  botaoIcone,
} from "./equipamentos-instrumento-unidades";
import { EquipamentosInstrumentoCancelar } from "./equipamentos-instrumento-cancelar";
import { EquipamentosInstrumentoPrevisao } from "./equipamentos-instrumento-previsao";

const SITUACAO: Record<ItemEquipamento["situacao"], [string, string]> = {
  pendente: ["Pendente", "bg-warning-bg text-warning border-warning/20"],
  parcial: ["Parcial", "bg-warning-bg text-warning border-warning/20"],
  entregue: ["Entregue", "bg-success-bg text-success border-success/20"],
  cancelado: ["Cancelado", "bg-muted text-muted-foreground border-border"],
  legado_a_revisar: [
    "A vincular",
    "bg-destructive-bg text-destructive border-destructive/20",
  ],
};

const formatarMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const COLUNAS =
  "md:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_10rem_11rem] md:items-center";

function DataDoItem({ item }: { item: ItemEquipamento }) {
  const concluido =
    item.situacao === "entregue" || item.situacao === "cancelado";
  const data = concluido ? item.ultima_entrega : item.previsao_entrega;
  if (!data)
    return (
      <div className="text-center text-[12px] text-muted-foreground">—</div>
    );
  const rotulo = concluido ? "Entregue" : "Previsão";
  const vencida = !concluido && data < new Date().toISOString().slice(0, 10);
  return (
    <div className="text-center leading-snug">
      <div
        className={cn(
          "text-[13px] font-semibold tabular-nums",
          vencida && "text-destructive",
        )}
      >
        {fmtData(data)}
      </div>
      <div
        className={cn(
          "text-[11px] text-muted-foreground",
          vencida && "text-destructive",
        )}
      >
        {vencida ? "Previsão vencida" : rotulo}
      </div>
    </div>
  );
}

export function EquipamentosInstrumentoLista({
  itens,
  podeEditar,
  onRegistrar,
  onCorrigir,
  onExcluirEntrega,
  onCancelarUnidade,
  onDesfazerCancelamento,
  onDefinirPrevisao,
  onRemoverPrevisao,
}: {
  itens: ItemEquipamento[];
  podeEditar: boolean;
  onRegistrar: (itemId: number) => void;
  onCorrigir: (unidade: UnidadeEquipamento) => void;
  onExcluirEntrega: (entregaId: number, motivo: string) => Promise<void>;
  onCancelarUnidade: (itemId: number, motivo: string) => Promise<void>;
  onDesfazerCancelamento: (
    cancelamentoId: number,
    motivo: string,
  ) => Promise<void>;
  onDefinirPrevisao: (itemId: number, dataPrevista: string) => Promise<void>;
  onRemoverPrevisao: (itemId: number, motivo: string) => Promise<void>;
}) {
  const [previsaoItem, setPrevisaoItem] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState<number | null>(null);
  const [verUnidades, setVerUnidades] = useState<number | null>(null);
  const posicoes = posicaoEntreIguais(itens);
  const itemAberto = itens.find((i) => i.id === verUnidades);
  const itemPrevisao = itens.find((i) => i.id === previsaoItem);
  const itemCancelando = itens.find((i) => i.id === cancelando);
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
        <span className="text-center">Entregue</span>
        <span className="text-center">Situação</span>
        <span className="whitespace-nowrap text-center">
          Conclusão / previsão
        </span>
        <span />
      </div>
      {itens.map((item) => {
        const [rotulo, classes] = SITUACAO[item.situacao];
        const nome = item.nome;
        const posicao = posicoes.get(item.id);
        const planejado = item.quantidade_planejada;
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
              <div className="text-center text-[12.5px] tabular-nums">
                <span className="font-semibold">
                  {item.quantidade_entregue}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  / {planejado ?? "?"}
                </span>
                {item.quantidade_cancelada > 0 && (
                  <span className="block text-[11px] text-muted-foreground">
                    {item.quantidade_cancelada} cancelada(s)
                  </span>
                )}
              </div>
              <div className="text-center">
                <span
                  className={cn(
                    "inline-block rounded-full border px-2.5 py-[3px] text-[10.5px] font-bold",
                    classes,
                  )}
                >
                  {rotulo}
                </span>
              </div>
              <DataDoItem item={item} />
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
                {podeEditar &&
                  item.situacao !== "entregue" &&
                  item.situacao !== "cancelado" && (
                    <button
                      type="button"
                      className={botaoIcone}
                      aria-label={`Previsão de entrega de ${nome}`}
                      title="Previsão de entrega"
                      onClick={() => setPrevisaoItem(item.id)}
                    >
                      <CalendarClock className="size-4" aria-hidden="true" />
                    </button>
                  )}
                {podeEditar &&
                  item.quantidade_planejada != null &&
                  (item.quantidade_cancelada > 0 ||
                    item.quantidade_planejada > item.quantidade_entregue) && (
                    <button
                      type="button"
                      className={botaoIcone}
                      aria-label={`Cancelar unidade de ${nome}`}
                      title="Cancelar unidade"
                      onClick={() => setCancelando(item.id)}
                    >
                      <Ban className="size-4" aria-hidden="true" />
                    </button>
                  )}
                {podeEditar &&
                  item.situacao !== "entregue" &&
                  item.situacao !== "cancelado" && (
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
            {item.rendimentos.map((r) => (
              <p
                key={r.id}
                className="m-0 mt-2 border-l-2 border-border pl-3 text-[12px] text-muted-foreground"
              >
                Rendimento da aplicação
                {r.valor_total != null &&
                  `: ${formatarMoeda.format(r.valor_total)}`}{" "}
                · não soma unidade
              </p>
            ))}
          </div>
        );
      })}
      {itemPrevisao && (
        <EquipamentosInstrumentoPrevisao
          item={itemPrevisao}
          onFechar={() => setPrevisaoItem(null)}
          onDefinir={onDefinirPrevisao}
          onRemover={onRemoverPrevisao}
        />
      )}
      {itemCancelando && (
        <EquipamentosInstrumentoCancelar
          item={itemCancelando}
          onFechar={() => setCancelando(null)}
          onCancelar={onCancelarUnidade}
          onDesfazer={onDesfazerCancelamento}
        />
      )}
      {itemAberto && (
        <EquipamentosInstrumentoUnidades
          nome={itemAberto.nome}
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
