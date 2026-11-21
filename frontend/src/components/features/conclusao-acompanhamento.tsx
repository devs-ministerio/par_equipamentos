/** Ação "Concluir acompanhamento" do cartão de fase: janela com o resultado calculado,
 * as pendências que impedem concluir e a confirmação da equipe. Concluído, oferece a reabertura. */
import { useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/common/error-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAvaliacaoConclusao,
  useConcluirAcompanhamento,
  useReabrirAcompanhamento,
} from "@/hooks/useConclusaoAcompanhamento";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import { ROTULO_RESULTADO } from "@/lib/conclusao-rotulos";
import { fmtData } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";
import {
  type ConclusaoFormValues,
  type MotivoUnidadeFormValues,
  criarConclusaoSchema,
  motivoUnidadeSchema,
} from "@/lib/validations/monitoramento";
import type { AvaliacaoConclusao } from "@/services/conclusao-acompanhamento";
import { ErroCampo, estiloInput } from "./monitoramento-ui";

function pedeInauguracaoDe(avaliacao: AvaliacaoConclusao): boolean {
  return ["prevista", "sem_resposta"].includes(avaliacao.inauguracao.situacao);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function JanelaConcluir({
  avaliacao,
  onEnviar,
  onFechar,
}: {
  avaliacao: AvaliacaoConclusao;
  onEnviar: (v: ConclusaoFormValues) => Promise<void>;
  onFechar: () => void;
}) {
  const id = useId();
  const schema = useMemo(
    () => criarConclusaoSchema(avaliacao.exige_justificativa),
    [avaliacao.exige_justificativa],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConclusaoFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      dataConclusao: hoje(),
      dataInauguracao: "",
      justificativa: "",
    },
  });
  const bloqueado = avaliacao.impedimentos.length > 0;
  // Inauguração é opcional e só se informa quando ainda não aconteceu nem foi dispensada.
  const pedeInauguracao = pedeInauguracaoDe(avaliacao);
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Concluir acompanhamento</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={handleSubmit(async (v) => {
            try {
              await onEnviar(v);
              onFechar();
            } catch {
              // O erro vira o banner global da página; a janela fica aberta.
            }
          })}
        >
          <p className="m-0 text-[12.5px]">
            Resultado:{" "}
            <strong>
              {ROTULO_RESULTADO[avaliacao.resultado].toLowerCase()}
            </strong>
            <span className="text-muted-foreground">
              {" "}
              · {avaliacao.itens_completos} de {avaliacao.itens_exigidos}{" "}
              item(ns) completo(s)
            </span>
          </p>
          {avaliacao.resultado !== "integral" && (
            <p className="m-0 text-[12.5px] text-warning">
              {avaliacao.resultado === "sem_entregas"
                ? "Todas as unidades foram canceladas. Concluir encerra o acompanhamento sem entregas."
                : "Parte das unidades foi cancelada. Concluir encerra o acompanhamento com entrega parcial."}
            </p>
          )}
          {bloqueado && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive-bg/40 p-2.5 text-[12.5px]"
            >
              <strong>Pendências que impedem concluir</strong>
              <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">
                {avaliacao.impedimentos.map((i) => (
                  <li key={`${i.tipo}-${i.descricao}`}>{i.descricao}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-data`} className="text-[11px]">
                Data da conclusão
              </label>
              <input
                id={`${id}-data`}
                type="date"
                max={hoje()}
                className={cn(estiloInput, "w-full")}
                aria-invalid={Boolean(errors.dataConclusao)}
                {...register("dataConclusao")}
              />
              <ErroCampo
                id={`${id}-data-erro`}
                mensagem={errors.dataConclusao?.message}
              />
            </div>
            {pedeInauguracao && (
              <div>
                <label htmlFor={`${id}-inaug`} className="text-[11px]">
                  Data de inauguração (opcional)
                </label>
                <input
                  id={`${id}-inaug`}
                  type="date"
                  max={hoje()}
                  className={cn(estiloInput, "w-full")}
                  aria-invalid={Boolean(errors.dataInauguracao)}
                  {...register("dataInauguracao")}
                />
                <ErroCampo
                  id={`${id}-inaug-erro`}
                  mensagem={errors.dataInauguracao?.message}
                />
                {avaliacao.inauguracao.data_prevista && (
                  <span className="text-[11px] text-muted-foreground">
                    Previsão: {fmtData(avaliacao.inauguracao.data_prevista)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-just`} className="text-[11px]">
              Justificativa
              {avaliacao.exige_justificativa ? "" : " (opcional)"}
            </label>
            <textarea
              id={`${id}-just`}
              rows={2}
              className={cn(estiloInput, "w-full")}
              aria-invalid={Boolean(errors.justificativa)}
              {...register("justificativa")}
            />
            <ErroCampo
              id={`${id}-just-erro`}
              mensagem={errors.justificativa?.message}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || bloqueado}>
              {isSubmitting ? "Concluindo..." : "Concluir acompanhamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JanelaReabrir({
  onEnviar,
  onFechar,
}: {
  onEnviar: (motivo: string) => Promise<void>;
  onFechar: () => void;
}) {
  const id = useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MotivoUnidadeFormValues>({
    resolver: zodResolver(motivoUnidadeSchema),
    defaultValues: { motivo: "" },
  });
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reabrir acompanhamento</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={handleSubmit(async (v) => {
            try {
              await onEnviar(v.motivo);
              onFechar();
            } catch {
              // O erro vira o banner global da página; a janela fica aberta.
            }
          })}
        >
          <div>
            <label htmlFor={id} className="text-[11px]">
              Motivo da reabertura
            </label>
            <textarea
              id={id}
              rows={2}
              className={cn(estiloInput, "w-full")}
              aria-invalid={Boolean(errors.motivo)}
              {...register("motivo")}
            />
            <ErroCampo id={`${id}-erro`} mensagem={errors.motivo?.message} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Reabrindo..." : "Reabrir acompanhamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConclusaoAcompanhamento({
  numeroConvenio,
  podeEditarInstrumento,
  aoSessaoInvalida,
  aoErro,
}: {
  numeroConvenio: string;
  podeEditarInstrumento: boolean;
  aoSessaoInvalida: () => void;
  aoErro: (mensagem: string | null) => void;
}) {
  const consulta = useAvaliacaoConclusao(numeroConvenio);
  const concluir = useConcluirAcompanhamento(numeroConvenio);
  const reabrir = useReabrirAcompanhamento(numeroConvenio);
  const [janela, setJanela] = useState<"concluir" | "reabrir" | null>(null);

  async function escrever<T>(acao: () => Promise<T>): Promise<void> {
    aoErro(null);
    try {
      await acao();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        aoSessaoInvalida();
      aoErro(mensagemSeguraDoErro(e));
      throw e;
    }
  }

  const avaliacao = consulta.data;
  if (!avaliacao && consulta.isError)
    return (
      <ErrorAlert
        mensagem={mensagemSeguraDoErro(consulta.error)}
        onRetry={() => void consulta.refetch()}
      />
    );
  if (!avaliacao)
    return consulta.isPending ? <Skeleton className="h-8 w-40" /> : null;
  const podeEditar = podeEditarInstrumento && avaliacao.pode_editar;
  const concluida = avaliacao.conclusao;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {concluida && (
        <span className="text-[12px] text-muted-foreground">
          Concluído em {fmtData(concluida.data_conclusao)} ·{" "}
          {ROTULO_RESULTADO[concluida.resultado].toLowerCase()}
        </span>
      )}
      {podeEditar && (
        <Button
          size="sm"
          variant={concluida ? "outline" : "default"}
          onClick={() => setJanela(concluida ? "reabrir" : "concluir")}
        >
          {concluida ? "Reabrir" : "Concluir acompanhamento"}
        </Button>
      )}
      {janela === "concluir" && (
        <JanelaConcluir
          avaliacao={avaliacao}
          onFechar={() => setJanela(null)}
          onEnviar={(v) =>
            escrever(() =>
              concluir.mutateAsync({
                resultado_confirmado: avaliacao.resultado,
                data_conclusao: v.dataConclusao,
                justificativa: v.justificativa?.trim() || null,
                data_inauguracao: pedeInauguracaoDe(avaliacao)
                  ? v.dataInauguracao || null
                  : avaliacao.inauguracao.data_realizada,
              }),
            )
          }
        />
      )}
      {janela === "reabrir" && (
        <JanelaReabrir
          onFechar={() => setJanela(null)}
          onEnviar={(motivo) => escrever(() => reabrir.mutateAsync(motivo))}
        />
      )}
    </div>
  );
}
