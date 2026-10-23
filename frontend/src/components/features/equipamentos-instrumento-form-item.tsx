/** Bloco de um item no painel de entrega: marcação e uma linha por unidade. */
import { Plus, X } from "lucide-react";
import {
  type Control,
  type UseFormRegister,
  useFieldArray,
} from "react-hook-form";
import { faltam } from "@/lib/equipamento-rotulos";
import { cn } from "@/lib/utils";
import {
  type RegistrarEntregaFormValues,
  unidadeVazia,
} from "@/lib/validations/entregas";
import type { ItemEquipamento } from "@/services/entregas-equipamento";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

const campo = cn(estiloInput, "w-full");

interface ErrosItem {
  unidades?: {
    message?: string;
    root?: { message?: string };
    [k: number]:
      | { vidaUtilAnos?: { message?: string }; serie?: { message?: string } }
      | undefined;
  };
}

export function EquipamentosInstrumentoFormItem({
  indice: i,
  item,
  ativo,
  erro,
  register,
  control,
  rotuloFalta,
  titulo,
  fixo,
}: {
  indice: number;
  item: ItemEquipamento;
  ativo: boolean;
  erro?: ErrosItem;
  register: UseFormRegister<RegistrarEntregaFormValues>;
  control: Control<RegistrarEntregaFormValues>;
  rotuloFalta: string;
  titulo: string;
  /** Item único já escolhido: sem caixa de seleção. */
  fixo: boolean;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `itens.${i}.unidades`,
  });
  const falta = faltam(item);
  const atingiuLimite = falta !== null && fields.length >= falta;
  return (
    <div className="rounded-md border p-2.5">
      <label className="flex items-center gap-2 text-[12.5px] font-semibold">
        {!fixo && (
          <input type="checkbox" {...register(`itens.${i}.selecionado`)} />
        )}
        {titulo}
        <span className="font-normal text-muted-foreground">{rotuloFalta}</span>
      </label>
      {ativo && (
        <div className="mt-2 grid gap-2">
          {fields.map((u, k) => (
            <div
              key={u.id}
              className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_1fr_1fr_5.5rem_auto]"
            >
              <label className="text-[11px]">
                Marca
                <input
                  className={campo}
                  {...register(`itens.${i}.unidades.${k}.marca`)}
                />
              </label>
              <label className="text-[11px]">
                Modelo
                <input
                  className={campo}
                  {...register(`itens.${i}.unidades.${k}.modelo`)}
                />
              </label>
              <label className="text-[11px]">
                Nº de série
                <input
                  className={campo}
                  {...register(`itens.${i}.unidades.${k}.serie`)}
                />
                <ErroCampo
                  id={`s-${item.id}-${k}`}
                  mensagem={erro?.unidades?.[k]?.serie?.message}
                />
              </label>
              <label className="text-[11px]">
                Vida útil (anos)
                <input
                  inputMode="numeric"
                  className={campo}
                  {...register(`itens.${i}.unidades.${k}.vidaUtilAnos`)}
                />
                <ErroCampo
                  id={`v-${item.id}-${k}`}
                  mensagem={erro?.unidades?.[k]?.vidaUtilAnos?.message}
                />
              </label>
              {fields.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remover unidade ${k + 1}`}
                  title="Remover"
                  className="inline-flex size-8 items-center justify-center self-end rounded-md border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                  onClick={() => remove(k)}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          <ErroCampo
            id={`u-${item.id}`}
            mensagem={erro?.unidades?.message ?? erro?.unidades?.root?.message}
          />
          <button
            type="button"
            disabled={atingiuLimite}
            className="inline-flex w-fit items-center gap-1 text-[12px] font-semibold text-primary disabled:text-muted-foreground"
            onClick={() => append({ ...unidadeVazia })}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar unidade
          </button>
        </div>
      )}
    </div>
  );
}
