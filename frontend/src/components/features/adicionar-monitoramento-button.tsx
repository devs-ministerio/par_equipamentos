/** Inclusão explícita de um item já conhecido no monitoramento interno.
 * O técnico é informado antes da confirmação final e a criação fica em
 * AuditLog no backend. */
import { useState } from "react";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  criarInstrumento,
  fetchColaboradoresMonitoramento,
} from "@/services/monitoramento-instrumentos";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { monitoramentoKeys } from "@/hooks/monitoramento-query-keys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Candidato } from "./adicionar-monitoramento-aviso";
import {
  PassoConfirmacao,
  PassoFormulario,
} from "./adicionar-monitoramento-passos";
import { botaoIcone } from "./equipamentos-instrumento-unidades";
import type { CriarInstrumentoInput } from "@/services/monitoramento-instrumentos";

type Etapa = "form" | "confirmar";

export interface DadosAdicionarMonitoramento extends Omit<
  CriarInstrumentoInput,
  "tecnico_titular_id" | "tecnico_suplente_id"
> {
  referencia: string;
  descricao: string;
}

export function AdicionarMonitoramentoButton({
  dados,
  candidatos = [],
  rotulo = "+ Adicionar ao monitoramento interno",
  somenteIcone = false,
  aoAdicionar,
}: {
  dados: DadosAdicionarMonitoramento;
  candidatos?: Candidato[];
  rotulo?: string;
  /** Gatilho como ícone pequeno com legenda (title), no padrão do check de entrega. */
  somenteIcone?: boolean;
  aoAdicionar?: () => void;
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
      aoAdicionar?.();
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

  if (dados.tipo_contratacao === "PERSUS II") {
    return (
      <Button
        size="sm"
        disabled
        title="PERSUS II não entra no monitoramento interno por enquanto."
      >
        {rotulo}
      </Button>
    );
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => (v ? setAberto(true) : fechar())}
    >
      {somenteIcone ? (
        <button
          type="button"
          className={botaoIcone}
          aria-label={`${rotulo}: ${dados.referencia}`}
          title={rotulo}
          onClick={() => setAberto(true)}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <Button size="sm" onClick={() => setAberto(true)}>
          {rotulo}
        </Button>
      )}
      <DialogContent>
        {etapa === "form" ? (
          <PassoFormulario
            dados={dados}
            candidatos={candidatos}
            tecnicoTitular={tecnicoTitular}
            onTecnico={setTecnicoTitular}
            colaboradores={colaboradoresQuery.data ?? []}
            carregando={colaboradoresQuery.isLoading}
            erro={erro}
            onCancelar={fechar}
            onConfirmar={() => {
              setErro(null);
              if (!tecnicoTitular.trim()) {
                setErro("Informe o técnico titular responsável.");
                return;
              }
              setEtapa("confirmar");
            }}
          />
        ) : (
          <PassoConfirmacao
            dados={dados}
            tecnicoTitular={tecnicoTitular}
            erro={erro}
            enviando={mutation.isPending}
            onVoltar={() => setEtapa("form")}
            onAdicionar={() => mutation.mutate()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
