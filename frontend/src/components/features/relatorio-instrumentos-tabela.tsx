import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type { ConvenioUnificado } from "@/types/monitoramento";

/** Tabela de prévia de "Instrumentos/Programas" (convênios) do relatório de
 * Instrumentos e Repasse -- mostra exatamente o recorte que os filtros
 * acima vão gerar no Excel/Word (Seção 5 da constituição: coluna numérica
 * sempre alinhada à direita; linhas divididas por borda, sem card por
 * linha). Client-side: os itens já chegam filtrados pela página (mesmo
 * dado de `useConveniosLista`, sem chamada nova). */
export function RelatorioInstrumentosTabela({
  itens,
  onLimparFiltros,
}: {
  itens: ConvenioUnificado[];
  onLimparFiltros: () => void;
}) {
  if (itens.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum instrumento com esse filtro"
        descricao="Ajuste os filtros acima ou limpe para ver o universo completo."
        acao={
          <Button variant="outline" size="sm" onClick={onLimparFiltros}>
            Limpar filtros
          </Button>
        }
      />
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="max-h-[420px] overflow-auto">
        <Table className="text-[12.5px]">
          <TableHeader className="sticky top-0 z-[1] bg-card text-[11px] tracking-wide text-muted-foreground uppercase">
            <TableRow>
              <TableHead className="px-4.5 py-[9px]">Número</TableHead>
              <TableHead className="px-2.5 py-[9px]">Convenente</TableHead>
              <TableHead className="px-2.5 py-[9px]">Município/UF</TableHead>
              <TableHead className="px-2.5 py-[9px]">
                Tipo de contratação
              </TableHead>
              <TableHead className="px-2.5 py-[9px]">Situação</TableHead>
              <TableHead className="px-2.5 py-[9px] text-right">Ano</TableHead>
              <TableHead className="px-4.5 py-[9px] text-right">
                Valor global
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item.numero}>
                <TableCell className="px-4.5 py-2 font-mono text-[11.5px] text-muted-foreground">
                  {item.numero}
                </TableCell>
                <TableCell className="px-2.5 py-2 font-medium whitespace-normal">
                  {item.convenente.nome}
                </TableCell>
                <TableCell className="px-2.5 py-2 whitespace-normal text-muted-foreground">
                  {item.municipio}/{item.uf}
                </TableCell>
                <TableCell className="px-2.5 py-2 text-muted-foreground">
                  {item.tipoContratacao ?? "Convênio"}
                </TableCell>
                <TableCell className="px-2.5 py-2 whitespace-normal text-muted-foreground">
                  {item.situacao}
                </TableCell>
                <TableCell className="px-2.5 py-2 text-right text-muted-foreground">
                  {item.numeroInstrumento?.split("/")[1] ?? "—"}
                </TableCell>
                <TableCell className="px-4.5 py-2 text-right font-semibold">
                  {fmtMoeda(item.financeiro.global)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-border px-4.5 py-2 text-[11.5px] text-muted-foreground">
        {itens.length} instrumento{itens.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
