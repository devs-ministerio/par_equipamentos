import { useState } from "react";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CandidatoLegado } from "@/services/candidatos-legados";

function moeda(valor: string | null): string {
  if (valor === null || valor === "") return "—";
  const n = Number(valor.replace(",", "."));
  return Number.isNaN(n)
    ? "—"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CandidatoLegadoItensDialog({
  candidato,
}: {
  candidato: CandidatoLegado;
}) {
  const [aberto, setAberto] = useState(false);
  const total = candidato.itens.length;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-label={`Ver itens do convênio ${candidato.numero}`}
        onClick={() => setAberto(true)}
      >
        <List aria-hidden />
        Itens{total ? ` · ${total}` : ""}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Itens do convênio {candidato.numero}</DialogTitle>
          </DialogHeader>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item na última recaptura.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor unitário</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidato.itens.map((item, indice) => (
                    <TableRow key={`${item.nome}-${indice}`}>
                      <TableCell className="whitespace-normal">
                        {item.nome}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantidade ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {moeda(item.valor_unitario)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {moeda(item.valor_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
