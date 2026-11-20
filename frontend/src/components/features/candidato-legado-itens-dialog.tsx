import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CandidatoLegado } from "@/services/candidatos-legados";

export function CandidatoLegadoItensDialog({
  candidato,
}: {
  candidato: CandidatoLegado;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="mt-3 min-h-11 sm:min-h-8"
        onClick={() => setAberto(true)}
      >
        Ver itens{candidato.itens.length ? ` (${candidato.itens.length})` : ""}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Itens do convênio {candidato.numero}</DialogTitle>
          </DialogHeader>
          {candidato.itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item na última recaptura.
            </p>
          ) : (
            <ul className="max-h-[60vh] list-disc space-y-1 overflow-y-auto pl-5 text-sm">
              {candidato.itens.map((nome) => (
                <li key={nome}>{nome}</li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
