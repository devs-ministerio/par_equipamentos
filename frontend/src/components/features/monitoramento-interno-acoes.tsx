/** Seção "Ações de monitoramento" -- form de criação + lista, visualmente
 * separada da timeline de eventos (design pedido pelo usuário 2026-09-09).
 * Extraído de MonitoramentoInterno.tsx.
 *
 * Editar/excluir (Plan Mode monitoramento-evolucao 2026-09-19) seguem a
 * mesma disciplina append-only do backend -- ver docstring de
 * monitoramento-interno-eventos.tsx, mesmo padrão aqui. */
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AcaoMonitoramento } from "@/services/monitoramento-acoes";
import { diasAte, fmtData } from "@/lib/monitoramento-format";
import type { CriarAcaoFormValues } from "@/lib/validations/monitoramento";
import { MonitoramentoInternoFormAcao } from "./monitoramento-interno-form-acao";
import {
  ConfirmarExclusaoComMotivo,
  SecaoOperacional,
  estiloInput,
} from "./monitoramento-ui";

function valoresIniciaisDaAcao(
  acao: AcaoMonitoramento,
): Partial<CriarAcaoFormValues> {
  return {
    descricao: acao.descricao,
    dataPrevista: acao.data_prevista ?? undefined,
    responsavel: acao.responsavel ?? undefined,
  };
}

export function MonitoramentoInternoAcoes({
  acoes,
  podeEditar,
  concluindoAcaoId,
  onCriar,
  onConcluir,
  onEditar,
  onExcluir,
}: {
  acoes: AcaoMonitoramento[] | undefined;
  podeEditar: boolean;
  concluindoAcaoId: number | null;
  onCriar: (valores: CriarAcaoFormValues) => Promise<void>;
  onConcluir: (acaoId: number) => void;
  onEditar: (acaoId: number, valores: CriarAcaoFormValues) => Promise<void>;
  onExcluir: (acaoId: number, motivo: string) => Promise<void>;
}) {
  const [acaoEmEdicao, setAcaoEmEdicao] = useState<number | null>(null);
  const [acaoEmExclusao, setAcaoEmExclusao] = useState<number | null>(null);

  return (
    <SecaoOperacional titulo="Ações de monitoramento" destaque>
      <MonitoramentoInternoFormAcao podeEditar={podeEditar} onCriar={onCriar} />

      {!acoes || acoes.length === 0 ? (
        <p className="text-muted-foreground italic text-[12.5px] m-0">
          Nenhuma ação registrada ainda.
        </p>
      ) : (
        <div className="grid gap-1.5">
          {[...acoes]
            .sort(
              (a, b) =>
                Number(!!a.data_conclusao) - Number(!!b.data_conclusao) ||
                (a.data_prevista ?? "9999").localeCompare(
                  b.data_prevista ?? "9999",
                ),
            )
            .map((acao) => {
              const diasPrazo = !acao.data_conclusao
                ? diasAte(acao.data_prevista)
                : null;
              const atrasada = diasPrazo !== null && diasPrazo < 0;
              const emEdicao = acaoEmEdicao === acao.id;
              const emExclusao = acaoEmExclusao === acao.id;
              return (
                <div
                  key={acao.id}
                  className={cn(
                    "relative flex flex-col gap-2 bg-card rounded-lg py-2 px-2.5 border",
                    atrasada ? "border-destructive" : "border-border",
                    acao.data_conclusao &&
                      !emEdicao &&
                      !emExclusao &&
                      "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between",
                      podeEditar && !emEdicao && !emExclusao && "sm:pr-36",
                    )}
                  >
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "text-[12.5px] font-semibold",
                          acao.data_conclusao && "line-through",
                        )}
                      >
                        {acao.descricao}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {(acao.responsavel_nome ?? acao.responsavel) && (
                          <>
                            Responsável:{" "}
                            {acao.responsavel_nome ?? acao.responsavel} ·{" "}
                          </>
                        )}
                        {acao.data_conclusao
                          ? `Concluída em ${fmtData(acao.data_conclusao)}`
                          : acao.data_prevista
                            ? `Prazo: ${fmtData(acao.data_prevista)}`
                            : "Sem prazo definido"}
                        {atrasada && (
                          <span className="text-destructive font-bold">
                            {" "}
                            · atrasada há {Math.abs(diasPrazo!)} dia(s)
                          </span>
                        )}
                      </div>
                      {/* Marcador de criação (Plan Mode monitoramento-evolucao
                          2026-09-19) -- pedido do usuário: "coloque um
                          marcador com o nome do responsável que criou". */}
                      <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">
                        {acao.criado_por_nome
                          ? `Criada por ${acao.criado_por_nome}`
                          : "Criador não registrado"}
                      </div>
                    </div>
                    {!acao.data_conclusao && (
                      <button
                        onClick={() => onConcluir(acao.id)}
                        disabled={!podeEditar || concluindoAcaoId === acao.id}
                        aria-label={`Concluir ação: ${acao.descricao}`}
                        className={cn(
                          estiloInput,
                          "min-h-11 cursor-pointer shrink-0 whitespace-nowrap border border-success bg-transparent px-2.5 py-1 font-semibold text-success sm:min-h-0",
                        )}
                      >
                        {concluindoAcaoId === acao.id ? "..." : "✓ Concluir"}
                      </button>
                    )}
                  </div>
                  {podeEditar && !emEdicao && !emExclusao && (
                    <div className="flex flex-row justify-end gap-1.5 border-t border-border pt-2 sm:absolute sm:right-2 sm:top-1/2 sm:-translate-y-1/2 sm:border-0 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAcaoEmEdicao(acao.id);
                          setAcaoEmExclusao(null);
                        }}
                        className={cn(
                          estiloInput,
                          "min-h-11 cursor-pointer border border-primary bg-transparent px-3 py-1 text-xs font-semibold text-primary sm:min-h-0 sm:px-2 sm:text-[11px]",
                        )}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAcaoEmExclusao(acao.id);
                          setAcaoEmEdicao(null);
                        }}
                        className={cn(
                          estiloInput,
                          "min-h-11 cursor-pointer border border-destructive bg-transparent px-3 py-1 text-xs font-semibold text-destructive sm:min-h-0 sm:px-2 sm:text-[11px]",
                        )}
                      >
                        Excluir
                      </button>
                    </div>
                  )}

                  {emEdicao && (
                    <MonitoramentoInternoFormAcao
                      podeEditar={podeEditar}
                      valoresIniciais={valoresIniciaisDaAcao(acao)}
                      rotuloSubmit="Salvar correção"
                      rotuloEnviando="Salvando..."
                      limparAoEnviar={false}
                      onCriar={async (valores) => {
                        await onEditar(acao.id, valores);
                        setAcaoEmEdicao(null);
                      }}
                    />
                  )}

                  {emExclusao && (
                    <ConfirmarExclusaoComMotivo
                      onExcluir={async (motivo) => {
                        await onExcluir(acao.id, motivo);
                        setAcaoEmExclusao(null);
                      }}
                      onCancelar={() => setAcaoEmExclusao(null)}
                    />
                  )}
                </div>
              );
            })}
        </div>
      )}
    </SecaoOperacional>
  );
}
