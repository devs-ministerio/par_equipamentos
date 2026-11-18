/** Janela de confirmação do repasse, aberta ao registrar a primeira entrega. */
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
import {
  type ConfirmarRepasseFormValues,
  confirmarRepasseSchema,
} from "@/lib/validations/monitoramento";
import { estiloInput, rotuloCampo } from "./monitoramento-ui";

export function RepasseConfirmarDialog({
  onFechar,
  onConfirmar,
}: {
  onFechar: () => void;
  onConfirmar: (valores: ConfirmarRepasseFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmarRepasseFormValues>({
    resolver: zodResolver(confirmarRepasseSchema),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onConfirmar)} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Confirmar repasse</DialogTitle>
          </DialogHeader>
          <fieldset className="m-0 space-y-1 border-0 p-0">
            <legend className={rotuloCampo}>Valor repassado</legend>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="radio" value="integral" {...register("tipo")} />
              Integral
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="radio" value="parcial" {...register("tipo")} />
              Parcial
            </label>
            {errors.tipo && (
              <p role="alert" className="m-0 text-xs text-destructive">
                {errors.tipo.message}
              </p>
            )}
          </fieldset>
          <div>
            <label htmlFor="repasse-justificativa" className={rotuloCampo}>
              Justificativa
            </label>
            <textarea
              id="repasse-justificativa"
              rows={2}
              className={`${estiloInput} w-full`}
              {...register("justificativa")}
            />
            {errors.justificativa && (
              <p role="alert" className="m-0 text-xs text-destructive">
                {errors.justificativa.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
