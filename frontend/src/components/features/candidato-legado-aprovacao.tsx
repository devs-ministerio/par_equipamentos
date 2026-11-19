import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAprovacaoLegado } from "@/hooks/useAprovacaoLegado";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import type { ProvaLegado } from "@/services/aprovacao-legado";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { fetchColaboradoresMonitoramento } from "@/services/monitoramento-instrumentos";
import { estiloInput } from "./monitoramento-ui";

const JUSTIFICATIVA = "Aprovado no Radar de instrumentos.";

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
  const painelId = `aprovacao-legado-${candidato.id}`;
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
        {aberta ? "Fechar" : "Aprovar"}
      </Button>
      {aberta && (
        <section
          id={painelId}
          aria-label={`Aprovação do convênio ${candidato.numero}`}
          className="mt-4 space-y-3 border-l-2 border-primary pl-4"
        >
          {prova.isFetching ? (
            <div role="status" aria-label="Consultando fonte oficial">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : prova.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {mensagemSeguraDoErro(prova.error)}
            </p>
          ) : prova.data && atual ? (
            <AprovacaoForm
              key={`${prova.data.recaptura_id}-${prova.dataUpdatedAt}`}
              candidatoId={candidato.id}
              prova={prova.data}
              mutation={mutation}
              fechar={() => setAberta(false)}
            />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              O Radar mudou. Atualize a lista antes de aprovar.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function AprovacaoForm({
  candidatoId,
  prova,
  mutation,
  fechar,
}: {
  candidatoId: number;
  prova: ProvaLegado;
  mutation: ReturnType<typeof useAprovacaoLegado>["mutation"];
  fechar: () => void;
}) {
  const [chave] = useState(() => crypto.randomUUID());
  const [tecnico, setTecnico] = useState("");
  const colaboradores = useQuery({
    queryKey: ["monitoramento", "colaboradores"],
    queryFn: fetchColaboradoresMonitoramento,
  });
  const campoId = `tecnico-legado-${candidatoId}`;
  const conflito =
    mutation.error instanceof ApiError && mutation.error.status === 409;
  return (
    <form
      className="space-y-3"
      onSubmit={async (evento) => {
        evento.preventDefault();
        try {
          await mutation.mutateAsync({
            chave,
            captura_id: prova.captura_id,
            recaptura_id: prova.recaptura_id,
            hash_revisado: prova.hash_revisado,
            versao: prova.versao,
            justificativa: JUSTIFICATIVA,
            ...(tecnico ? { tecnico_titular_id: Number(tecnico) } : {}),
          });
          fechar();
        } catch {
          /* Mensagem segura abaixo; a chave é preservada no retry. */
        }
      }}
    >
      <div>
        <label htmlFor={campoId} className="mb-1 block text-xs font-semibold">
          Técnico titular
        </label>
        <select
          id={campoId}
          className={`${estiloInput} w-full bg-background`}
          value={tecnico}
          onChange={(e) => setTecnico(e.target.value)}
          disabled={mutation.isPending || colaboradores.isLoading}
        >
          <option value="">— Sem técnico —</option>
          {(colaboradores.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {mutation.error && (
        <p role="alert" className="text-xs text-destructive">
          {mensagemSeguraDoErro(mutation.error)}
        </p>
      )}
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
