/** Form "Nova ação" -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import {
  criarAcaoSchema,
  type CriarAcaoFormValues,
} from "@/lib/validations/monitoramento";
import { RESPONSAVEIS_ACAO } from "@/lib/monitoramento-opcoes";
import { ErroCampo, estiloInput } from "./monitoramento-ui";
import { idsDescricaoCampo } from "@/lib/monitoramento-status";

export function MonitoramentoInternoFormAcao({
  podeEditar,
  onCriar,
  valoresIniciais,
  rotuloSubmit = "+ Adicionar",
  rotuloEnviando = "Adicionando...",
  limparAoEnviar = true,
}: {
  podeEditar: boolean;
  onCriar: (valores: CriarAcaoFormValues) => Promise<void>;
  /** Pré-preenche pra correção (Plan Mode monitoramento-evolucao
   * 2026-09-19) -- "editar" é sempre uma correção append-only. */
  valoresIniciais?: Partial<CriarAcaoFormValues>;
  rotuloSubmit?: string;
  rotuloEnviando?: string;
  limparAoEnviar?: boolean;
}) {
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
      className="flex gap-2.5 flex-wrap items-start mb-3.5"
    >
      <div className="flex-[2] min-w-[220px]">
        <label
          htmlFor="acao-descricao"
          className="text-[11px] text-muted-foreground block mb-1"
        >
          Nova ação
        </label>
        <input
          id="acao-descricao"
          className={cn(estiloInput, "w-full")}
          placeholder="O que precisa ser feito..."
          aria-invalid={Boolean(errors.descricao)}
          aria-describedby={idsDescricaoCampo(
            "acao-descricao",
            Boolean(errors.descricao),
            false,
          )}
          {...register("descricao")}
        />
        <ErroCampo
          id="acao-descricao-error"
          mensagem={errors.descricao?.message}
        />
      </div>
      <div>
        <label
          htmlFor="acao-data-prevista"
          className="text-[11px] text-muted-foreground block mb-1"
        >
          Prazo
        </label>
        <input
          id="acao-data-prevista"
          type="date"
          className={estiloInput}
          {...register("dataPrevista")}
        />
      </div>
      <div className="min-w-40">
        <label
          htmlFor="acao-responsavel"
          className="text-[11px] text-muted-foreground block mb-1"
        >
          Responsável
        </label>
        <select
          id="acao-responsavel"
          className={cn(estiloInput, "w-full bg-background")}
          {...register("responsavel")}
        >
          <option value="">— Não informado —</option>
          {RESPONSAVEIS_ACAO.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {/* Label invisível do mesmo tamanho da dos outros campos -- achado
          2026-09-15, pedido do usuário: "o botão adicionar do ações está
          desalinhado". Sem isso o botão (sem label acima) ficava alinhado
          no topo da linha (items-start), acima da altura real dos inputs
          vizinhos (que têm label + margem antes do input). */}
      <div>
        <span
          aria-hidden="true"
          className="mb-1 block text-[11px] text-transparent select-none"
        >
          Ação
        </span>
        <button
          type="submit"
          disabled={!podeEditar || isSubmitting}
          className={cn(
            estiloInput,
            "cursor-pointer bg-primary text-primary-foreground border-none font-semibold",
          )}
        >
          {isSubmitting ? rotuloEnviando : rotuloSubmit}
        </button>
      </div>
    </form>
  );
}
