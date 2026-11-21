/** Aprovação no Radar: um pop-up só, igual ao de adicionar ao monitoramento
 * interno. Escolher o técnico titular e confirmar já leva o instrumento ao
 * monitoramento interno. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorAlert } from "@/components/common/error-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAprovacaoLegado } from "@/hooks/useAprovacaoLegado";
import { ApiError, mensagemSeguraDoErro } from "@/lib/api-error";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type { ProvaLegado } from "@/services/aprovacao-legado";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { fetchColaboradoresMonitoramento } from "@/services/monitoramento-instrumentos";
import { Campo, estiloInput } from "./monitoramento-ui";

const JUSTIFICATIVA = "Aprovado no Radar de instrumentos.";

export function CandidatoLegadoAprovacao({
  candidato,
}: {
  candidato: CandidatoLegado;
}) {
  const [aberto, setAberto] = useState(false);
  const { podeAprovar, prova, mutation } = useAprovacaoLegado(
    candidato,
    aberto,
  );
  if (!podeAprovar) return null;
  const atual =
    prova.data?.captura_id === candidato.captura_id &&
    prova.data?.versao === candidato.versao;
  function fechar() {
    setAberto(false);
    mutation.reset();
  }
  return (
    <>
      <Button
        type="button"
        className="min-h-11 sm:min-h-8"
        onClick={() => setAberto(true)}
      >
        Aprovar
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => (v ? setAberto(true) : fechar())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Adicionar {candidato.numero} ao monitoramento interno
            </DialogTitle>
            <DialogDescription>
              Escolha o técnico que vai acompanhar o instrumento.
            </DialogDescription>
          </DialogHeader>
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
              candidato={candidato}
              prova={prova.data}
              mutation={mutation}
              fechar={fechar}
            />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              O Radar mudou. Atualize a lista antes de aprovar.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AprovacaoForm({
  candidato,
  prova,
  mutation,
  fechar,
}: {
  candidato: CandidatoLegado;
  prova: ProvaLegado;
  mutation: ReturnType<typeof useAprovacaoLegado>["mutation"];
  fechar: () => void;
}) {
  const [chave] = useState(() => crypto.randomUUID());
  const [tecnico, setTecnico] = useState("");
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const colaboradores = useQuery({
    queryKey: ["monitoramento", "colaboradores"],
    queryFn: fetchColaboradoresMonitoramento,
  });
  const campoId = `tecnico-legado-${candidato.id}`;
  const conflito =
    mutation.error instanceof ApiError && mutation.error.status === 409;
  return (
    <form
      className="space-y-3"
      onSubmit={async (evento) => {
        evento.preventDefault();
        if (!tecnico) {
          setErroLocal("Informe o técnico titular responsável.");
          return;
        }
        setErroLocal(null);
        try {
          await mutation.mutateAsync({
            chave,
            captura_id: prova.captura_id,
            recaptura_id: prova.recaptura_id,
            hash_revisado: prova.hash_revisado,
            versao: prova.versao,
            justificativa: JUSTIFICATIVA,
            tecnico_titular_id: Number(tecnico),
          });
          fechar();
        } catch {
          /* Mensagem segura abaixo; a chave é preservada no retry. */
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3">
        <Campo label="Instrumento">{candidato.numero}</Campo>
        <Campo label="Valor">{fmtMoeda(candidato.valor_global)}</Campo>
        <Campo label="Município/UF">
          {candidato.municipio ?? "—"}/{candidato.uf ?? "—"}
        </Campo>
      </div>
      <div>
        <label htmlFor={campoId} className="mb-1 block text-xs font-semibold">
          Técnico titular
        </label>
        <select
          id={campoId}
          className={`${estiloInput} w-full bg-background`}
          value={tecnico}
          onChange={(e) => setTecnico(e.target.value)}
          disabled={
            mutation.isPending ||
            colaboradores.isLoading ||
            colaboradores.isError
          }
          autoFocus
        >
          <option value="">— Selecione o colaborador —</option>
          {(colaboradores.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {colaboradores.isError && (
          <div className="mt-2">
            <ErrorAlert
              mensagem={mensagemSeguraDoErro(colaboradores.error)}
              onRetry={() => void colaboradores.refetch()}
            />
          </div>
        )}
      </div>
      {(erroLocal || mutation.error) && (
        <p role="alert" className="text-xs text-destructive">
          {erroLocal ?? mensagemSeguraDoErro(mutation.error)}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={fechar}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending || conflito}>
          {mutation.isPending ? "Adicionando…" : "Confirmar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
