/** Form "Nova ação" -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  criarAcaoSchema,
  type CriarAcaoFormValues,
} from "@/lib/validations/monitoramento";
import { comValorAtual, RESPONSAVEIS_ACAO } from "@/lib/monitoramento-opcoes";
import { ErroCampo, estiloInput } from "./monitoramento-ui";
import { idsDescricaoCampo } from "@/lib/monitoramento-status";

export function MonitoramentoInternoFormAcao({
  podeEditar,
  onCriar,
  valoresIniciais,
  rotuloSubmit = "+ Adicionar",
  rotuloEnviando = "Adicionando...",
  limparAoEnviar = true,
  onCancelar,
  rotuloCampo = "Nova ação",
}: {
  podeEditar: boolean;
  onCriar: (valores: CriarAcaoFormValues) => Promise<void>;
  /** Pré-preenche pra correção (Plan Mode monitoramento-evolucao
   * 2026-09-19) -- "editar" é sempre uma correção append-only. */
  valoresIniciais?: Partial<CriarAcaoFormValues>;
  rotuloSubmit?: string;
  rotuloEnviando?: string;
  limparAoEnviar?: boolean;
  /** Descarta a edição aberta sem enviar nada. */
  onCancelar?: () => void;
  rotuloCampo?: string;
}) {
  const formId = useId();
  const descricaoId = `${formId}-acao-descricao`;
  const prazoId = `${formId}-acao-data-prevista`;
  const responsavelId = `${formId}-acao-responsavel`;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CriarAcaoFormValues>({
    resolver: zodResolver(criarAcaoSchema),
    defaultValues: valoresIniciais,
  });

  async function aoSubmeter(valores: CriarAcaoFormValues) {
    try {
      await onCriar(valores);
      if (limparAoEnviar) reset();
    } catch {
      // Erro de escrita vira o banner global da página.
    }
  }

  return (
    <form
      onSubmit={handleSubmit(aoSubmeter)}
      className="mb-3.5 grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <div className="min-w-0 sm:col-span-3">
        <label
          htmlFor={descricaoId}
          className="text-[11px] text-muted-foreground block mb-1"
        >
          {rotuloCampo}
        </label>
        <textarea
          id={descricaoId}
          rows={4}
          className={cn(estiloInput, "block w-full resize-y")}
          placeholder="O que precisa ser feito..."
          aria-invalid={Boolean(errors.descricao)}
          aria-describedby={idsDescricaoCampo(
            descricaoId,
            Boolean(errors.descricao),
            false,
          )}
          {...register("descricao")}
        />
        <ErroCampo
          id={`${descricaoId}-error`}
          mensagem={errors.descricao?.message}
        />
      </div>
      <div className="min-w-0">
        <label
          htmlFor={prazoId}
          className="text-[11px] text-muted-foreground block mb-1"
        >
          Prazo
        </label>
        <input
          id={prazoId}
          type="date"
          className={cn(estiloInput, "block w-full min-w-0")}
          {...register("dataPrevista")}
        />
      </div>
      <div className="min-w-0">
        <label
          htmlFor={responsavelId}
          className="text-[11px] text-muted-foreground block mb-1"
        >
          Responsável
        </label>
        <select
          id={responsavelId}
          className={cn(estiloInput, "block w-full bg-background")}
          {...register("responsavel")}
        >
          <option value="">— Não informado —</option>
          {comValorAtual(RESPONSAVEIS_ACAO, valoresIniciais?.responsavel).map(
            (r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <button
          type="submit"
          disabled={!podeEditar || isSubmitting}
          className={cn(
            estiloInput,
            "flex-1 cursor-pointer border-none bg-primary font-semibold text-primary-foreground",
          )}
        >
          {isSubmitting ? rotuloEnviando : rotuloSubmit}
        </button>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={isSubmitting}
            className={cn(
              estiloInput,
              "flex-1 cursor-pointer border border-border bg-transparent font-semibold",
            )}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
