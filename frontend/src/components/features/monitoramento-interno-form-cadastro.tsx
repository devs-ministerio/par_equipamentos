/** Form de "Cadastro interno" (CNES, técnico titular/suplente, nível de
 * monitoramento, tipologia, modalidade + responsável técnico da execução
 * na instituição) -- React Hook Form + zod. Extraído de
 * MonitoramentoInterno.tsx.
 *
 * Todo campo é lista suspensa, EXCETO responsável técnico da execução
 * (nome/contato da instituição/convenente -- texto livre, não tem
 * vocabulário fechado) -- achado 2026-09-15, pedido do usuário: "no
 * cadastro interno todos os campos deverão ser por seleção (lista
 * suspensa) exceto os dados do responsável técnico da execução". Opções
 * vêm de monitoramento-opcoes.ts (extraídas de dado real, nunca
 * inventadas).
 *
 * CNES (Plan Mode monitoramento-evolucao 2026-09-19) mora aqui dentro do
 * grid, antes de "Técnico titular", alinhado horizontalmente com os
 * demais campos -- não é mais um toggle solto no cabeçalho nem um modo
 * "somente CNES" à parte; "Editar cadastro" edita tudo de uma vez,
 * incluindo o CNES. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  fetchColaboradoresMonitoramento,
  type InstrumentoEquipamento,
} from "@/services/monitoramento-instrumentos";
import {
  cadastroInternoSchema,
  type CadastroInternoFormValues,
} from "@/lib/validations/monitoramento";
import { CnesPicker } from "@/components/common/cnes-picker";
import { ErroCampo, estiloInput } from "./monitoramento-ui";
import { MonitoramentoCadastroCampos } from "./monitoramento-cadastro-campos";

function valoresIniciais(
  inst: InstrumentoEquipamento,
): CadastroInternoFormValues {
  return {
    tecnicoTitular: inst.tecnico_titular_id?.toString() ?? "",
    tecnicoSuplente: inst.tecnico_suplente_id?.toString() ?? "",
    nivelMonitoramento: inst.nivel_monitoramento ?? "",
    tipologia: inst.tipologia ?? "",
    modalidadeOnco: inst.modalidade_onco ?? "",
    responsavelExecucaoNome: inst.responsavel_execucao_nome ?? "",
    responsavelExecucaoContato: inst.responsavel_execucao_contato ?? "",
    cnes: inst.cnes ?? "",
  };
}

export function MonitoramentoInternoFormCadastro({
  instrumento,
  onSalvar,
}: {
  instrumento: InstrumentoEquipamento;
  onSalvar: (valores: CadastroInternoFormValues) => Promise<void>;
}) {
  const prefixoId = useId();
  const colaboradoresQuery = useQuery({
    queryKey: ["monitoramento", "colaboradores"],
    queryFn: fetchColaboradoresMonitoramento,
    retry: false,
  });
  // Preservar a atribuição atual mesmo se o técnico saiu do catálogo ativo.
  // A API continua sendo responsável por validar qualquer nova atribuição.
  const colaboradores = [...(colaboradoresQuery.data ?? [])];
  for (const [id, nome] of [
    [instrumento.tecnico_titular_id, instrumento.tecnico_titular],
    [instrumento.tecnico_suplente_id, instrumento.tecnico_suplente],
  ] as const) {
    if (id != null && !colaboradores.some((item) => item.id === id)) {
      colaboradores.push({ id, name: nome || `Técnico atual (#${id})` });
    }
  }
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<CadastroInternoFormValues>({
    resolver: zodResolver(cadastroInternoSchema),
    defaultValues: valoresIniciais(instrumento),
  });
  const cnesAtual = watch("cnes");

  return (
    <form onSubmit={handleSubmit(onSalvar)} className="grid gap-4">
      {colaboradoresQuery.isError && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">
            Não foi possível carregar os colaboradores.
          </p>
          <button
            type="button"
            onClick={() => void colaboradoresQuery.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <MonitoramentoCadastroCampos
        instrumento={instrumento}
        prefixoId={prefixoId}
        register={register}
      >
        <div>
          <label
            htmlFor={`${prefixoId}-cnes`}
            className="text-[11px] text-muted-foreground block mb-1"
          >
            CNES
          </label>
          <CnesPicker
            id={`${prefixoId}-cnes`}
            inline
            valorAtual={cnesAtual || null}
            onEscolher={(cnes) => setValue("cnes", cnes ?? "")}
          />
        </div>
        {(["tecnicoTitular", "tecnicoSuplente"] as const).map((nome) => (
          <div key={nome}>
            <label
              htmlFor={`${prefixoId}-${nome}`}
              className="text-[11px] text-muted-foreground block mb-1"
            >
              {nome === "tecnicoTitular"
                ? "Técnico titular"
                : "Técnico suplente"}
            </label>
            <select
              id={`${prefixoId}-${nome}`}
              className={cn(estiloInput, "w-full bg-background")}
              disabled={
                colaboradoresQuery.isLoading || colaboradoresQuery.isError
              }
              aria-invalid={Boolean(errors[nome])}
              aria-describedby={
                errors[nome] ? `${prefixoId}-${nome}-erro` : undefined
              }
              {...register(nome)}
            >
              <option value="">
                {nome === "tecnicoTitular"
                  ? "— Selecione o colaborador —"
                  : "— Sem suplente —"}
              </option>
              {colaboradores.map((colaborador) => (
                <option key={colaborador.id} value={colaborador.id}>
                  {colaborador.name}
                </option>
              ))}
            </select>
            <ErroCampo
              id={`${prefixoId}-${nome}-erro`}
              mensagem={errors[nome]?.message}
            />
          </div>
        ))}
      </MonitoramentoCadastroCampos>
      <button
        type="submit"
        disabled={
          isSubmitting ||
          colaboradoresQuery.isLoading ||
          colaboradoresQuery.isError
        }
        className={cn(
          estiloInput,
          "cursor-pointer bg-success text-success-foreground border-none justify-self-start font-semibold",
        )}
      >
        {isSubmitting ? "Salvando..." : "Salvar cadastro"}
      </button>
    </form>
  );
}
