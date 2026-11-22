/** Janela "Cancelar unidade": motivo do cancelamento e lista de cancelamentos
 * ativos, que podem ser desfeitos com motivo. Mesmo padrão do registro de entrega. */
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtData } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";
import {
  type MotivoUnidadeFormValues,
  motivoUnidadeSchema,
} from "@/lib/validations/monitoramento";
import type { ItemEquipamento } from "@/services/entregas-equipamento";
import { botaoIcone } from "./equipamentos-instrumento-unidades";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

function CampoMotivo({
  rotulo,
  acao,
  onEnviar,
  onFechar,
}: {
  rotulo: string;
  acao: string;
  onEnviar: (motivo: string) => Promise<void>;
  onFechar: () => void;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MotivoUnidadeFormValues>({
    resolver: zodResolver(motivoUnidadeSchema),
    defaultValues: { motivo: "" },
  });
  return (
    <form
      className="grid gap-3"
      onSubmit={handleSubmit(async (v) => {
        try {
          await onEnviar(v.motivo);
        } catch {
          // O erro vira o banner global da página; a janela fica aberta.
        }
      })}
    >
      <div>
        <label htmlFor={id} className="text-[11px]">
          {rotulo}
        </label>
        <textarea
          id={id}
          rows={2}
          className={cn(estiloInput, "w-full")}
          aria-invalid={Boolean(errors.motivo)}
          {...register("motivo")}
        />
        <ErroCampo id={`${id}-erro`} mensagem={errors.motivo?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Voltar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : acao}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EquipamentosInstrumentoCancelar({
  item,
  onFechar,
  onCancelar,
  onDesfazer,
}: {
  item: ItemEquipamento;
  onFechar: () => void;
  onCancelar: (itemId: number, motivo: string) => Promise<void>;
  onDesfazer: (cancelamentoId: number, motivo: string) => Promise<void>;
}) {
  const [desfazendo, setDesfazendo] = useState<number | null>(null);
  const pendentes =
    (item.quantidade_planejada ?? 0) -
    item.quantidade_entregue -
    item.quantidade_cancelada;
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Cancelar unidade</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="m-0 text-[12.5px]">
            <strong>{item.nome}</strong>
            <span className="text-muted-foreground">
              {" "}
              · {item.quantidade_entregue} entregue(s),{" "}
              {item.quantidade_cancelada} cancelada(s), {Math.max(pendentes, 0)}{" "}
              pendente(s)
            </span>
          </p>
          {pendentes > 0 ? (
            <CampoMotivo
              rotulo="Motivo do cancelamento"
              acao="Cancelar unidade"
              onEnviar={(motivo) => onCancelar(item.id, motivo)}
              onFechar={onFechar}
            />
          ) : (
            <p className="m-0 text-[12.5px] text-muted-foreground">
              Nenhuma unidade pendente para cancelar.
            </p>
          )}
          {item.cancelamentos.length > 0 && (
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-1 text-[11px]">Cancelamentos</legend>
              {item.cancelamentos.map((c) => (
                <div
                  key={c.id}
                  className="rounded-md bg-muted/40 px-3 py-2 text-[12.5px]"
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 break-words">
                      {c.motivo}
                    </span>
                    <span className="text-muted-foreground">
                      {fmtData(c.criado_em.slice(0, 10))}
                    </span>
                    <button
                      type="button"
                      className={botaoIcone}
                      aria-label="Desfazer"
                      title="Desfazer cancelamento"
                      onClick={() => setDesfazendo(c.id)}
                    >
                      <Undo2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  {desfazendo === c.id && (
                    <div className="mt-3 border-t border-border pt-3">
                      <CampoMotivo
                        rotulo="Motivo para desfazer"
                        acao="Desfazer cancelamento"
                        onEnviar={async (motivo) => {
                          await onDesfazer(c.id, motivo);
                          setDesfazendo(null);
                        }}
                        onFechar={() => setDesfazendo(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </fieldset>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
