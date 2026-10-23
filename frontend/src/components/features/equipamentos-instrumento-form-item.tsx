/** Bloco de um item no painel de entrega: marcação e, se marcado, os dados da unidade. */
import type { UseFormRegister } from "react-hook-form";
import { cn } from "@/lib/utils";
import type { RegistrarEntregaFormValues } from "@/lib/validations/entregas";
import type { ItemEquipamento } from "@/services/entregas-equipamento";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

const campo = cn(estiloInput, "w-full");

export function EquipamentosInstrumentoFormItem({
  indice: i,
  item,
  ativo,
  erro,
  register,
  rotuloFalta,
  titulo,
  fixo,
}: {
  indice: number;
  item: ItemEquipamento;
  ativo: boolean;
  erro?: { quantidade?: { message?: string }; series?: { message?: string } };
  register: UseFormRegister<RegistrarEntregaFormValues>;
  rotuloFalta: string;
  titulo: string;
  /** Item único já escolhido: sem caixa de seleção. */
  fixo: boolean;
}) {
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
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <label className="text-[11px]">
            Quantidade
            <input
              type="number"
              min={1}
              className={campo}
              {...register(`itens.${i}.quantidade`)}
            />
          </label>
          <label className="text-[11px]">
            Marca
            <input className={campo} {...register(`itens.${i}.marca`)} />
          </label>
          <label className="text-[11px]">
            Modelo
            <input className={campo} {...register(`itens.${i}.modelo`)} />
          </label>
          <label className="text-[11px]">
            Vida útil (anos)
            <input
              type="number"
              min={0}
              className={campo}
              {...register(`itens.${i}.vidaUtilAnos`)}
            />
          </label>
          <label className="text-[11px] sm:col-span-4">
            Números de série (um por linha, opcional)
            <textarea
              rows={2}
              className={campo}
              {...register(`itens.${i}.series`)}
            />
          </label>
          <ErroCampo id={`q-${item.id}`} mensagem={erro?.quantidade?.message} />
          <ErroCampo id={`s-${item.id}`} mensagem={erro?.series?.message} />
        </div>
      )}
    </div>
  );
}
