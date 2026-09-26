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
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import { situacaoDeFato } from "@/lib/proposta-status";
import type { PropostaCandidata } from "@/services/propostas-candidatas";

/** Tabela de prévia de "Linhas de financiamento" (propostas candidatas) do
 * relatório de Instrumentos e Repasse -- 1 tabela reaproveitada nas 2
 * sub-abas (Confirmada/Parceria e Em tramitação/Proposta, ver
 * `estagioDeFato`), só troca a lista de itens recebida. Mesmas regras de
 * tabela da Seção 5 da constituição (numérico à direita, sem card por
 * linha). */
export function RelatorioPropostasTabela({
  itens,
  onLimparFiltros,
}: {
  itens: PropostaCandidata[];
  onLimparFiltros: () => void;
}) {
  if (itens.length === 0) {
    return (
      <EmptyState
        titulo="Nenhuma linha de financiamento com esse filtro"
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
              <TableHead className="px-4.5 py-[9px]">
                Proposta/Parceria
              </TableHead>
              <TableHead className="px-2.5 py-[9px]">Proponente</TableHead>
              <TableHead className="px-2.5 py-[9px]">Município/UF</TableHead>
              <TableHead className="px-2.5 py-[9px]">Programa</TableHead>
              <TableHead className="px-2.5 py-[9px]">Situação</TableHead>
              <TableHead className="px-2.5 py-[9px] text-right">
                Valor global
              </TableHead>
              <TableHead className="px-4.5 py-[9px] text-right">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="px-4.5 py-2 font-mono text-[11.5px] text-muted-foreground">
                  {item.cd_parceria ?? item.id_proposta}
                </TableCell>
                <TableCell className="px-2.5 py-2 font-medium whitespace-normal">
                  {item.nm_proponente}
                </TableCell>
                <TableCell className="px-2.5 py-2 whitespace-normal text-muted-foreground">
                  {item.municipio ?? "—"}/{item.uf ?? "—"}
                </TableCell>
                <TableCell className="px-2.5 py-2 whitespace-normal text-muted-foreground">
                  {item.nm_programa}
                </TableCell>
                <TableCell className="px-2.5 py-2 whitespace-normal text-muted-foreground">
                  {situacaoDeFato(item) ?? "—"}
                </TableCell>
                <TableCell className="px-2.5 py-2 text-right font-semibold">
                  {fmtMoeda(item.vl_global_proposta)}
                </TableCell>
                <TableCell className="px-4.5 py-2 text-right text-muted-foreground">
                  {fmtData(item.data_proposta)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-border px-4.5 py-2 text-[11.5px] text-muted-foreground">
        {itens.length} proposta{itens.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
