import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAprovacaoLegado } from "@/hooks/useAprovacaoLegado";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import {
  confirmacaoAprovacaoSchema,
  type ConfirmacaoAprovacaoInput,
} from "@/lib/validations/aprovacao-legado";
import type { ProvaLegado } from "@/services/aprovacao-legado";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { CandidatoLegadoProvaResumo } from "./candidato-legado-prova-resumo";

export function CandidatoLegadoAprovacao({
  candidato,
}: {
  candidato: CandidatoLegado;
}) {
  const [aberta, setAberta] = useState(false);
  const { podeAprovar, prova, mutation } = useAprovacaoLegado(
    candidato,
    aberta,
  );
  const painelId = `prova-legado-${candidato.id}`;
  if (!podeAprovar) return null;
  const atual =
    prova.data?.captura_id === candidato.captura_id &&
    prova.data?.versao === candidato.versao;
  return (
    <div className="mt-3 min-w-0">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full sm:w-auto"
        disabled={mutation.isPending}
        aria-expanded={aberta}
        aria-controls={painelId}
        onClick={() => {
          setAberta(!aberta);
          mutation.reset();
        }}
      >
        {aberta ? "Fechar conferência" : "Conferir para aprovar"}
      </Button>
      {aberta && (
        <section
          id={painelId}
          aria-label={`Conferência do convênio ${candidato.numero}`}
          className="mt-4 space-y-3 border-l-2 border-primary pl-4"
        >
          <h4 className="text-sm font-semibold">Conferência oficial</h4>
          {prova.isFetching ? (
            <div role="status" aria-label="Consultando prova oficial">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : prova.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {mensagemSeguraDoErro(prova.error)}
            </p>
          ) : prova.data && atual ? (
            <AprovacaoForm
              key={`${prova.data.recaptura_id}-${prova.dataUpdatedAt}`}
              prova={prova.data}
              mutation={mutation}
              fechar={() => setAberta(false)}
            />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              O Radar mudou. Atualize a lista antes de aprovar.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={prova.isFetching || mutation.isPending}
            onClick={() => {
              mutation.reset();
              void prova.refetch();
            }}
          >
            Recarregar resumo
          </Button>
        </section>
      )}
    </div>
  );
}

function AprovacaoForm({
  prova,
  mutation,
  fechar,
}: {
  prova: ProvaLegado;
  mutation: ReturnType<typeof useAprovacaoLegado>["mutation"];
  fechar: () => void;
}) {
  const [chave] = useState(() => crypto.randomUUID());
  const form = useForm<ConfirmacaoAprovacaoInput>({
    resolver: zodResolver(confirmacaoAprovacaoSchema),
    defaultValues: {
      chave,
      captura_id: prova.captura_id,
      recaptura_id: prova.recaptura_id,
      hash_revisado: prova.hash_revisado,
      versao: prova.versao,
      justificativa: "",
      confirmado: false,
    },
  });
  const campoId = `aprovacao-legado-${prova.candidato_id}`;
  const conflito =
    mutation.error instanceof ApiError && mutation.error.status === 409;
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(async ({ confirmado: _, ...pedido }) => {
        try {
          await mutation.mutateAsync(pedido);
          fechar();
        } catch {
          /* Mensagem segura abaixo; preservar chave no retry. */
        }
      })}
    >
      <CandidatoLegadoProvaResumo prova={prova} />
      <p className="text-xs text-muted-foreground">
        Inclui o convênio em Instrumentos/programas. Não inicia o monitoramento
        interno.
      </p>
      <label
        htmlFor={`${campoId}-confirmacao`}
        className="flex min-h-11 items-center gap-3 text-sm"
      >
        <Input
          id={`${campoId}-confirmacao`}
          type="checkbox"
          className="size-4 shrink-0"
          {...form.register("confirmado")}
          disabled={mutation.isPending}
          aria-invalid={Boolean(form.formState.errors.confirmado)}
          aria-describedby={`${campoId}-erro`}
        />
        Conferi os dados oficiais deste convênio.
      </label>
      <label htmlFor={campoId} className="block text-xs font-semibold">
        Justificativa da aprovação
      </label>
      <Input
        id={campoId}
        maxLength={1000}
        {...form.register("justificativa")}
        disabled={mutation.isPending}
        aria-invalid={Boolean(form.formState.errors.justificativa)}
        aria-describedby={`${campoId}-erro`}
      />
      <p
        id={`${campoId}-erro`}
        role="alert"
        className="text-xs text-destructive"
      >
        {form.formState.errors.confirmado?.message ??
          form.formState.errors.justificativa?.message ??
          (mutation.error ? mensagemSeguraDoErro(mutation.error) : null)}
      </p>
      <Button
        type="submit"
        className="min-h-11 w-full sm:w-auto"
        disabled={mutation.isPending || conflito}
      >
        {mutation.isPending ? "Aprovando…" : "Aprovar e incluir"}
      </Button>
    </form>
  );
}
