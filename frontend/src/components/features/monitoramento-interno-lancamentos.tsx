/** Botões "Evento" e "Ação" do cartão Cronograma, no mesmo padrão de "Documento":
 * cada um abre uma janela com o formulário. As listas (Ações e Eventos) ficam só com o histórico e a edição. */
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CriarAcaoFormValues,
  EnviarEventoFormValues,
} from "@/lib/validations/monitoramento";
import type { MarcoCatalogo } from "@/services/monitoramento-marcos";
import { MonitoramentoInternoFormAcao } from "./monitoramento-interno-form-acao";
import { MonitoramentoInternoFormEvento } from "./monitoramento-interno-form-evento";

export function MonitoramentoInternoLancamentos({
  marcos,
  podeEditar,
  onRegistrarEvento,
  onCriarAcao,
}: {
  marcos: MarcoCatalogo[];
  podeEditar: boolean;
  onRegistrarEvento: (valores: EnviarEventoFormValues) => Promise<void>;
  onCriarAcao: (valores: CriarAcaoFormValues) => Promise<void>;
}) {
  const [janela, setJanela] = useState<"evento" | "acao" | null>(null);
  if (!podeEditar) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setJanela("evento")}>
          <Plus className="size-4" aria-hidden="true" />
          Evento
        </Button>
        <Button size="sm" variant="outline" onClick={() => setJanela("acao")}>
          <Plus className="size-4" aria-hidden="true" />
          Ação
        </Button>
      </div>
      <Dialog
        open={janela !== null}
        onOpenChange={(a) => !a && setJanela(null)}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>
              {janela === "evento" ? "Registrar evento" : "Registrar ação"}
            </DialogTitle>
          </DialogHeader>
          {janela === "evento" && (
            <MonitoramentoInternoFormEvento
              marcos={marcos}
              onRegistrar={async (valores) => {
                await onRegistrarEvento(valores);
                setJanela(null);
              }}
            />
          )}
          {janela === "acao" && (
            <MonitoramentoInternoFormAcao
              podeEditar={podeEditar}
              rotuloSubmit="Registrar"
              rotuloEnviando="Registrando..."
              rotuloCampo="Descrição"
              onCriar={async (valores) => {
                await onCriarAcao(valores);
                setJanela(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
