/** Janela "Previsão de entrega": data prevista do item; remover exige motivo.
 * Não é a previsão de inauguração do instrumento. */
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type MotivoUnidadeFormValues,
  type PrevisaoEntregaFormValues,
  motivoUnidadeSchema,
  previsaoEntregaSchema,
} from "@/lib/validations/monitoramento";
import type { ItemEquipamento } from "@/services/entregas-equipamento";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

function FormRemover({
  onRemover,
  onVoltar,
}: {
  onRemover: (motivo: string) => Promise<void>;
  onVoltar: () => void;
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
          await onRemover(v.motivo);
        } catch {
          // O erro vira o banner global da página; a janela fica aberta.
        }
      })}
    >
      <div>
        <label htmlFor={id} className="text-[11px]">
          Motivo da remoção
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
        <Button type="button" variant="outline" onClick={onVoltar}>
          Voltar
        </Button>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting ? "Removendo..." : "Remover previsão"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EquipamentosInstrumentoPrevisao({
  item,
  onFechar,
  onDefinir,
  onRemover,
}: {
  item: ItemEquipamento;
  onFechar: () => void;
  onDefinir: (itemId: number, dataPrevista: string) => Promise<void>;
  onRemover: (itemId: number, motivo: string) => Promise<void>;
}) {
  const id = useId();
  const [removendo, setRemovendo] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PrevisaoEntregaFormValues>({
    resolver: zodResolver(previsaoEntregaSchema),
    defaultValues: { dataPrevista: item.previsao_entrega ?? "" },
  });
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Previsão de entrega</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-[12.5px] font-semibold">{item.nome}</p>
        {removendo ? (
          <FormRemover
            onVoltar={() => setRemovendo(false)}
            onRemover={async (motivo) => {
              await onRemover(item.id, motivo);
              onFechar();
            }}
          />
        ) : (
          <form
            className="grid gap-3"
            onSubmit={handleSubmit(async (v) => {
              try {
                await onDefinir(item.id, v.dataPrevista);
                onFechar();
              } catch {
                // O erro vira o banner global da página; a janela fica aberta.
              }
            })}
          >
            <div>
              <label htmlFor={id} className="text-[11px]">
                Data prevista
              </label>
              <input
                id={id}
                type="date"
                className={cn(estiloInput, "w-full")}
                aria-invalid={Boolean(errors.dataPrevista)}
                {...register("dataPrevista")}
              />
              <ErroCampo
                id={`${id}-erro`}
                mensagem={errors.dataPrevista?.message}
              />
            </div>
            <DialogFooter>
              {item.previsao_entrega && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRemovendo(true)}
                >
                  Remover
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar previsão"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
