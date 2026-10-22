/** Apresentação dos campos do cadastro; consulta e envio ficam no form. */
import type { ReactNode } from "react";
import type { UseFormRegister } from "react-hook-form";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import type { CadastroInternoFormValues } from "@/lib/validations/monitoramento";
import {
  comValorAtual,
  MODALIDADES_ONCO,
  NIVEIS_MONITORAMENTO,
} from "@/lib/monitoramento-opcoes";
import { TIPOLOGIA_PERSUS } from "@/data/constants";
import { cn } from "@/lib/utils";
import { estiloInput } from "./monitoramento-ui";

export function MonitoramentoCadastroCampos({
  instrumento,
  prefixoId,
  register,
  children,
}: {
  instrumento: InstrumentoEquipamento;
  prefixoId: string;
  register: UseFormRegister<CadastroInternoFormValues>;
  children: ReactNode;
}) {
  const campos = [
    {
      nome: "nivelMonitoramento",
      rotulo: "Nível de monitoramento",
      opcoes: comValorAtual(
        NIVEIS_MONITORAMENTO,
        instrumento.nivel_monitoramento,
      ),
    },
    {
      nome: "modalidadeOnco",
      rotulo: "Modalidade",
      opcoes: comValorAtual(MODALIDADES_ONCO, instrumento.modalidade_onco),
    },
    {
      nome: "tipologia",
      rotulo: "Tipologia",
      opcoes: comValorAtual(
        Object.keys(TIPOLOGIA_PERSUS),
        instrumento.tipologia,
      ),
    },
  ] as const;
  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {children}
        {campos.map(({ nome, rotulo, opcoes }) => (
          <div key={nome}>
            <label
              htmlFor={`${prefixoId}-${nome}`}
              className="text-[11px] text-muted-foreground block mb-1"
            >
              {rotulo}
            </label>
            <select
              id={`${prefixoId}-${nome}`}
              className={cn(estiloInput, "w-full bg-background")}
              {...register(nome)}
            >
              <option value="">— Não informado —</option>
              {opcoes.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {nome === "tipologia"
                    ? (TIPOLOGIA_PERSUS[opcao] ?? opcao)
                    : opcao}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div>
        <div className="text-[11.5px] font-bold text-primary mb-2">
          Responsável técnico da execução{" "}
          <span className="font-normal text-muted-foreground normal-case">
            (na instituição/convenente, opcional)
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {(
            [
              ["responsavelExecucaoNome", "Nome"],
              ["responsavelExecucaoContato", "Contato"],
            ] as const
          ).map(([nome, rotulo]) => (
            <div key={nome}>
              <label
                htmlFor={`${prefixoId}-${nome}`}
                className="text-[11px] text-muted-foreground block mb-1"
              >
                {rotulo}
              </label>
              <input
                id={`${prefixoId}-${nome}`}
                className={cn(estiloInput, "w-full")}
                {...register(nome)}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
