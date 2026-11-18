/** Fase calculada e confirmação de repasse (integral ou parcial) do instrumento. */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ErrorAlert } from "@/components/common/error-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConfirmarRepasse,
  useSituacaoRepasse,
} from "@/hooks/useRepasseInstrumento";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import {
  type ConfirmarRepasseFormValues,
  confirmarRepasseSchema,
} from "@/lib/validations/monitoramento";
import { estiloCard, estiloInput, rotuloCampo } from "./monitoramento-ui";

function FormConfirmarRepasse({
  aberto,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
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
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
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

export function RepasseInstrumento({
  numeroConvenio,
  podeEditar,
  aoSessaoInvalida,
}: {
  numeroConvenio: string;
  podeEditar: boolean;
  aoSessaoInvalida: () => void;
}) {
  const consulta = useSituacaoRepasse(numeroConvenio);
  const confirmar = useConfirmarRepasse(numeroConvenio);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (consulta.isLoading) return <Skeleton className="h-16 w-full" />;
  if (consulta.error || !consulta.data) {
    return <ErrorAlert mensagem={mensagemSeguraDoErro(consulta.error)} />;
  }
  const { repasse, fase_calculada } = consulta.data;

  async function enviar(valores: ConfirmarRepasseFormValues) {
    setErro(null);
    try {
      await confirmar.mutateAsync({
        tipo: valores.tipo,
        justificativa: valores.justificativa || null,
      });
      setAberto(false);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        aoSessaoInvalida();
      setErro(mensagemSeguraDoErro(e));
    }
  }

  return (
    <section
      className={`${estiloCard} flex flex-wrap items-center gap-x-8 gap-y-2`}
    >
      <div>
        <div className={rotuloCampo}>Fase</div>
        <div className="text-[13px] font-semibold">{fase_calculada}</div>
      </div>
      <div>
        <div className={rotuloCampo}>Repasse</div>
        <div className="text-[13px]">
          {repasse
            ? `${repasse.tipo === "integral" ? "Integral" : "Parcial"} · ${
                repasse.origem === "fonte"
                  ? "pela fonte"
                  : "confirmado pelo técnico"
              }`
            : "Não confirmado"}
        </div>
      </div>
      {podeEditar && (
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
          {repasse ? "Alterar repasse" : "Confirmar repasse"}
        </Button>
      )}
      {erro && <ErrorAlert mensagem={erro} />}
      {aberto && (
        <FormConfirmarRepasse
          aberto={aberto}
          onFechar={() => setAberto(false)}
          onConfirmar={enviar}
        />
      )}
    </section>
  );
}
