/** Painel "Registrar entrega": data, observação e um ou mais itens pendentes
 * (multisseleção). No modo legado a data vem do evento antigo e só os itens
 * são escolhidos. */
import { useId, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  faltam,
  nomeSemCodigo,
  posicaoEntreIguais,
  rotuloFalta,
} from "@/lib/equipamento-rotulos";
import { cn } from "@/lib/utils";
import {
  type RegistrarEntregaFormValues,
  itensParaApi,
  registrarEntregaSchema,
  unidadeVazia,
} from "@/lib/validations/entregas";
import type {
  ItemEntregaInput,
  ItemEquipamento,
} from "@/services/entregas-equipamento";
import { EquipamentosInstrumentoFormItem } from "./equipamentos-instrumento-form-item";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

export interface EnvioEntrega {
  chave: string;
  dataOcorrencia: string;
  observacao: string | null;
  itens: ItemEntregaInput[];
}

export function EquipamentosInstrumentoFormEntrega({
  itens,
  apenasItemId,
  dataLegada,
  onEnviar,
  onFechar,
}: {
  itens: ItemEquipamento[];
  /** Aberto pelo ícone de um item: mostra só ele. Sem isso, lista os pendentes. */
  apenasItemId?: number;
  /** Presente no vínculo de entrega antiga: data fixa do evento original. */
  dataLegada?: string | null;
  onEnviar: (envio: EnvioEntrega) => Promise<void>;
  onFechar: () => void;
}) {
  const formId = useId();
  const chave = useRef(crypto.randomUUID());
  const posicoes = posicaoEntreIguais(itens);
  const pendentes = itens.filter((i) =>
    apenasItemId ? i.id === apenasItemId : faltam(i) !== 0,
  );
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegistrarEntregaFormValues>({
    resolver: zodResolver(registrarEntregaSchema),
    defaultValues: {
      dataOcorrencia: dataLegada ?? new Date().toISOString().slice(0, 10),
      observacao: "",
      itens: pendentes.map((i) => ({
        itemId: i.id,
        selecionado: apenasItemId !== undefined,
        falta: faltam(i),
        unidades: [{ ...unidadeVazia }],
      })),
    },
  });
  const { fields } = useFieldArray({ control, name: "itens" });
  const marcados = watch("itens");

  async function aoSubmeter(v: RegistrarEntregaFormValues) {
    try {
      await onEnviar({
        chave: chave.current,
        dataOcorrencia: v.dataOcorrencia,
        observacao: v.observacao?.trim() || null,
        itens: itensParaApi(v.itens),
      });
      onFechar();
    } catch {
      // O erro vira o banner global da página; o painel fica aberto.
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>
            {dataLegada ? "Vincular entrega registrada" : "Registrar entrega"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(aoSubmeter)} className="grid gap-3">
          {!dataLegada && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${formId}-data`} className="text-[11px]">
                  Data da entrega
                </label>
                <input
                  id={`${formId}-data`}
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  className={cn(estiloInput, "w-full")}
                  aria-invalid={Boolean(errors.dataOcorrencia)}
                  {...register("dataOcorrencia")}
                />
                <ErroCampo
                  id={`${formId}-data-erro`}
                  mensagem={errors.dataOcorrencia?.message}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-obs`} className="text-[11px]">
                  Observação
                </label>
                <input
                  id={`${formId}-obs`}
                  className={cn(estiloInput, "w-full")}
                  {...register("observacao")}
                />
              </div>
            </div>
          )}
          <fieldset className="grid gap-2">
            <legend className="text-[11px] mb-1">Equipamentos entregues</legend>
            {fields.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">
                Todos os itens controlados já foram entregues.
              </p>
            )}
            {fields.map((campo, i) => {
              const item = pendentes[i];
              const ativo = marcados?.[i]?.selecionado;
              const erro = errors.itens?.[i];
              return (
                <EquipamentosInstrumentoFormItem
                  key={campo.id}
                  indice={i}
                  item={item}
                  ativo={Boolean(ativo)}
                  erro={erro}
                  register={register}
                  control={control}
                  rotuloFalta={rotuloFalta(item)}
                  titulo={[
                    nomeSemCodigo(item.descricao),
                    posicoes.get(item.id) && `(${posicoes.get(item.id)})`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  fixo={apenasItemId !== undefined}
                />
              );
            })}
            <ErroCampo
              id={`${formId}-itens`}
              mensagem={errors.itens?.message ?? errors.itens?.root?.message}
            />
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || fields.length === 0}
            >
              {isSubmitting ? "Registrando..." : "Confirmar entrega"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
