/** Janela de cadastro/correção de documento do instrumento. */
import { useId } from "react";
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
import { ROTULOS_DOCUMENTO } from "@/lib/documento-rotulos";
import { cn } from "@/lib/utils";
import {
  type DocumentoFormValues,
  documentoSchema,
} from "@/lib/validations/monitoramento";
import {
  type DocumentoInput,
  type DocumentoInstrumento,
  STATUS_CNEN,
  TIPOS_DOCUMENTO,
} from "@/services/documentos-instrumento";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

const NAO_CNEN = new Set(["nota_fiscal", "ordem_servico", "trp", "trd"]);

export function DocumentosInstrumentoForm({
  documento,
  onSalvar,
  onFechar,
}: {
  /** Presente na correção; ausente no cadastro. */
  documento?: DocumentoInstrumento;
  /** Equipamentos do instrumento cuja família exige licença da ANSN. */
  onSalvar: (corpo: DocumentoInput) => Promise<void>;
  onFechar: () => void;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DocumentoFormValues>({
    resolver: zodResolver(documentoSchema),
    defaultValues: {
      tipo: documento?.tipo,
      numero: documento?.numero ?? "",
      dataDocumento: documento?.data_documento ?? "",
      status: documento?.status ?? "",
      dataValidade: documento?.data_validade ?? "",
      observacao: documento?.observacao ?? "",
    },
  });
  const tipo = watch("tipo");
  const ehCnen = tipo !== undefined && !NAO_CNEN.has(tipo);
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>
            {documento ? "Corrigir documento" : "Registrar documento"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={handleSubmit(async (v) => {
            try {
              await onSalvar({
                tipo: v.tipo,
                numero: v.numero?.trim() || null,
                data_documento: v.dataDocumento,
                status: ehCnen ? v.status || null : null,
                data_validade:
                  v.tipo === "cnen_licenca" ? v.dataValidade || null : null,
                observacao: v.observacao?.trim() || null,
              });
              onFechar();
            } catch {
              // O erro vira o banner global da página; a janela fica aberta.
            }
          })}
        >
          <div>
            <label htmlFor={`${id}-tipo`} className="text-[11px]">
              Tipo
            </label>
            <select
              id={`${id}-tipo`}
              className={cn(estiloInput, "w-full")}
              aria-invalid={Boolean(errors.tipo)}
              {...register("tipo")}
            >
              <option value="">Selecione</option>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {ROTULOS_DOCUMENTO[t]}
                </option>
              ))}
            </select>
            <ErroCampo id={`${id}-tipo-erro`} mensagem={errors.tipo?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-numero`} className="text-[11px]">
                Número
              </label>
              <input
                id={`${id}-numero`}
                className={cn(estiloInput, "w-full")}
                {...register("numero")}
              />
              <ErroCampo
                id={`${id}-numero-erro`}
                mensagem={errors.numero?.message}
              />
            </div>
            <div>
              <label htmlFor={`${id}-data`} className="text-[11px]">
                Data do documento
              </label>
              <input
                id={`${id}-data`}
                type="date"
                className={cn(estiloInput, "w-full")}
                aria-invalid={Boolean(errors.dataDocumento)}
                {...register("dataDocumento")}
              />
              <ErroCampo
                id={`${id}-data-erro`}
                mensagem={errors.dataDocumento?.message}
              />
            </div>
          </div>
          {ehCnen && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-status`} className="text-[11px]">
                  Situação na ANSN
                </label>
                <select
                  id={`${id}-status`}
                  className={cn(estiloInput, "w-full")}
                  {...register("status")}
                >
                  <option value="">Não informada</option>
                  {STATUS_CNEN.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {tipo === "cnen_licenca" && (
                <div>
                  <label htmlFor={`${id}-validade`} className="text-[11px]">
                    Validade
                  </label>
                  <input
                    id={`${id}-validade`}
                    type="date"
                    className={cn(estiloInput, "w-full")}
                    {...register("dataValidade")}
                  />
                </div>
              )}
            </div>
          )}
          <div>
            <label htmlFor={`${id}-obs`} className="text-[11px]">
              Observação
            </label>
            <textarea
              id={`${id}-obs`}
              rows={2}
              className={cn(estiloInput, "w-full")}
              {...register("observacao")}
            />
            <ErroCampo
              id={`${id}-obs-erro`}
              mensagem={errors.observacao?.message}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar documento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
