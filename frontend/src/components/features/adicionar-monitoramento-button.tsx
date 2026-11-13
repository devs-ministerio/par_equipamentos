/** Inclusão explícita de um item já conhecido no monitoramento interno.
 * O técnico é informado antes da confirmação final e a criação fica em
 * AuditLog no backend. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  criarInstrumento,
  fetchColaboradoresMonitoramento,
} from "@/services/monitoramento-instrumentos";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { monitoramentoKeys } from "@/hooks/monitoramento-query-keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Campo, estiloInput } from "./monitoramento-ui";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type {
  CriarInstrumentoInput,
  InstrumentoEquipamento,
} from "@/services/monitoramento-instrumentos";

type Etapa = "form" | "confirmar";

export interface DadosAdicionarMonitoramento extends Omit<
  CriarInstrumentoInput,
  "tecnico_titular_id" | "tecnico_suplente_id"
> {
  referencia: string;
  descricao: string;
}

type Candidato = Pick<
  InstrumentoEquipamento,
  | "nr_convenio"
  | "nome_convenente"
  | "tipo_contratacao"
  | "investimento_aquisicao"
>;

/** Aviso, sem bloqueio: o mesmo CNES já tem instrumento monitorado. Só
 * documento ou identificador oficial confirma que é o mesmo financiamento. */
function AvisoCandidatos({ candidatos }: { candidatos: Candidato[] }) {
  if (candidatos.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs"
    >
      <p className="m-0 font-semibold">
        Já existe monitoramento neste CNES. Pode ser o mesmo financiamento.
      </p>
      <ul className="mb-0 mt-1.5 list-none space-y-0.5 p-0">
        {candidatos.map((c) => (
          <li key={c.nr_convenio}>
            <span className="font-mono">{c.nr_convenio}</span>
            {c.tipo_contratacao ? ` · ${c.tipo_contratacao}` : ""} ·{" "}
            {c.nome_convenente} · {fmtMoeda(c.investimento_aquisicao)}
          </li>
        ))}
      </ul>
      <p className="mb-0 mt-1.5 text-muted-foreground">
        CNES e valor não bastam para concluir. Confirme por documento oficial
        antes de incluir.
      </p>
    </div>
  );
}

export function AdicionarMonitoramentoButton({
  dados,
  candidatos = [],
}: {
  dados: DadosAdicionarMonitoramento;
  candidatos?: Candidato[];
}) {
  const sessao = useAuthSession();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("form");
  const [tecnicoTitular, setTecnicoTitular] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const colaboradoresQuery = useQuery({
    queryKey: ["monitoramento", "colaboradores"],
    queryFn: fetchColaboradoresMonitoramento,
    enabled: aberto,
  });

  function fechar() {
    setAberto(false);
    setEtapa("form");
    setErro(null);
    setTecnicoTitular("");
  }

  const mutation = useMutation({
    mutationFn: () => {
      const {
        referencia: _referencia,
        descricao: _descricao,
        ...corpo
      } = dados;
      return criarInstrumento({
        ...corpo,
        tecnico_titular_id: Number(tecnicoTitular),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: monitoramentoKeys.instrumentos,
      });
      fechar();
    },
    onError: (e) => setErro(mensagemSeguraDoErro(e)),
  });

  if (!sessao.podeEditar) {
    return (
      <p className="text-xs text-muted-foreground italic m-0">
        Faça login para adicionar este item ao monitoramento.
      </p>
    );
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => (v ? setAberto(true) : fechar())}
    >
      <Button size="sm" onClick={() => setAberto(true)}>
        + Adicionar ao monitoramento interno
      </Button>
      <DialogContent>
        {etapa === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Adicionar {dados.referencia} ao monitoramento interno
              </DialogTitle>
              <DialogDescription>
                {dados.descricao}. Informe o técnico titular responsável.
              </DialogDescription>
            </DialogHeader>

            <AvisoCandidatos candidatos={candidatos} />

            <div>
              <label
                htmlFor="tecnico-titular-novo"
                className="text-[11px] text-muted-foreground block mb-1"
              >
                Técnico titular responsável
              </label>
              <select
                id="tecnico-titular-novo"
                className={`${estiloInput} w-full bg-background`}
                value={tecnicoTitular}
                onChange={(e) => setTecnicoTitular(e.target.value)}
                autoFocus
                disabled={colaboradoresQuery.isLoading}
              >
                <option value="">— Selecione o colaborador —</option>
                {(colaboradoresQuery.data ?? []).map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.name}
                  </option>
                ))}
              </select>
              {erro && (
                <p className="text-xs text-destructive mt-1.5">{erro}</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={fechar}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setErro(null);
                  if (!tecnicoTitular.trim()) {
                    setErro("Informe o técnico titular responsável.");
                    return;
                  }
                  setEtapa("confirmar");
                }}
              >
                Confirmar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirma a inclusão?</DialogTitle>
              <DialogDescription>
                Revise antes de criar -- essa ação fica registrada no histórico
                do sistema.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-3">
              <Campo label="Instrumento">{dados.referencia}</Campo>
              <Campo label="Convenente">{dados.nome_convenente}</Campo>
              <Campo label="Município/UF">
                {dados.municipio || "—"}/{dados.uf || "—"}
              </Campo>
              <Campo label="Técnico titular">{tecnicoTitular.trim()}</Campo>
            </div>
            {erro && <p className="text-xs text-destructive mt-1.5">{erro}</p>}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEtapa("form")}
                disabled={mutation.isPending}
              >
                Voltar
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Adicionando..." : "Sim, adicionar"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
