import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTriagemLegado } from "@/hooks/useTriagemLegado";
import {
  decisaoLegadoSchema,
  type DecisaoLegadoInput,
} from "@/lib/validations/decisao-legado";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { CandidatoLegadoHistorico } from "./candidato-legado-historico";
import { CandidatoLegadoAprovacao } from "./candidato-legado-aprovacao";

export function CandidatoLegadoTriagem({
  candidato,
}: {
  candidato: CandidatoLegado;
}) {
  const [acao, setAcao] = useState<DecisaoLegadoInput["acao"]>();
  const { podeDecidir } = useTriagemLegado(candidato.id);
  const aberta =
    candidato.situacao === "novo" || candidato.situacao === "em_analise";
  return (
    <div className="mt-4 border-t border-border pt-3">
      {acao ? (
        <DecisaoForm
          candidato={candidato}
          acao={acao}
          fechar={() => setAcao(undefined)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>button]:h-11 [&>button]:min-w-0 [&>button]:px-4 [&>button:first-child]:col-span-2">
          {podeDecidir && aberta && candidato.origem === "siconv_oficial" && (
            <>
              {candidato.situacao === "novo" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAcao("iniciar_analise")}
                >
                  Iniciar análise
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAcao("rejeitar")}
              >
                Rejeitar
              </Button>
            </>
          )}
        </div>
      )}
      {!acao &&
        podeDecidir &&
        aberta &&
        candidato.origem === "siconv_oficial" &&
        candidato.confirmacao_portal === "confirmado" && (
          <CandidatoLegadoAprovacao candidato={candidato} />
        )}
      {candidato.versao > 0 && (
        <CandidatoLegadoHistorico candidatoId={candidato.id} />
      )}
    </div>
  );
}

function DecisaoForm({
  candidato,
  acao,
  fechar,
}: {
  candidato: CandidatoLegado;
  acao: DecisaoLegadoInput["acao"];
  fechar: () => void;
}) {
  const { mutation } = useTriagemLegado(candidato.id);
  const [chave] = useState(() => crypto.randomUUID());
  const form = useForm<DecisaoLegadoInput>({
    resolver: zodResolver(decisaoLegadoSchema),
    defaultValues: {
      acao,
      chave,
      captura_id: candidato.captura_id,
      versao: candidato.versao,
      justificativa: "",
    },
  });
  const campoId = `justificativa-legado-${candidato.id}`;
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(async (dados) => {
        try {
          await mutation.mutateAsync(dados);
          fechar();
        } catch {
          /* Erro apresentado no formulário e toast. */
        }
      })}
    >
      <label htmlFor={campoId} className="text-xs font-semibold">
        {acao === "rejeitar"
          ? "Motivo da rejeição"
          : "Justificativa da análise"}
      </label>
      <Input
        id={campoId}
        autoFocus
        maxLength={1000}
        {...form.register("justificativa")}
        aria-invalid={Boolean(form.formState.errors.justificativa)}
        aria-describedby={`${campoId}-erro`}
        disabled={mutation.isPending}
      />
      <div
        id={`${campoId}-erro`}
        role="alert"
        className="text-xs text-destructive"
      >
        {form.formState.errors.justificativa?.message ??
          (mutation.error ? mensagemSeguraDoErro(mutation.error) : null)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? "Registrando…" : "Confirmar decisão"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={fechar}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
