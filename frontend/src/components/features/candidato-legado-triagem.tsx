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

/** Por que o Aprovar está travado (null = liberado). A decisão final continua no backend. */
function motivoSemAprovacaoDe(candidato: CandidatoLegado): string | null {
  if (candidato.confirmacao_portal !== "confirmado")
    return "Libera quando o Portal da Transparência confirmar";
  if (!candidato.recaptura_em)
    return "Aguardando os dados oficiais do convênio";
  return null;
}

export function CandidatoLegadoTriagem({
  candidato,
}: {
  candidato: CandidatoLegado;
}) {
  const [acao, setAcao] = useState<DecisaoLegadoInput["acao"]>();
  const { podeDecidir } = useTriagemLegado(candidato.id);
  const aberta =
    candidato.situacao === "novo" || candidato.situacao === "em_analise";
  const motivoSemAprovacao = motivoSemAprovacaoDe(candidato);
  return (
    <div className="mt-4 border-t border-border pt-3">
      {acao ? (
        <DecisaoForm
          candidato={candidato}
          acao={acao}
          fechar={() => setAcao(undefined)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {podeDecidir &&
            aberta &&
            (motivoSemAprovacao ? (
              <Button
                type="button"
                className="min-h-11 sm:min-h-8"
                disabled
                title={motivoSemAprovacao}
              >
                Aprovar
              </Button>
            ) : (
              <CandidatoLegadoAprovacao candidato={candidato} />
            ))}
          {podeDecidir && aberta && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 sm:min-h-8"
              onClick={() => setAcao("rejeitar")}
            >
              Rejeitar
            </Button>
          )}
        </div>
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
        Motivo da rejeição
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
