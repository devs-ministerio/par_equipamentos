import { useState } from "react";
import { Pagination } from "@/components/common/pagination";
import { estiloCard } from "@/components/features/monitoramento-ui";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import { situacaoDeFato } from "@/lib/proposta-status";
import type { PropostaCandidata } from "@/services/propostas-candidatas";

const PAGE_SIZE = 20;

/** Tabela de prévia de "Linhas de financiamento" (propostas candidatas) do
 * relatório de Instrumentos e Repasse -- 1 componente reaproveitado nas 2
 * seções (Confirmada/Parceria e Em tramitação/Proposta, empilhadas uma
 * abaixo da outra, ver `estagioDeFato`), só troca `titulo`/`itens`. Mesmo
 * padrão de layout/formatação da tabela de Instrumentos Monitorados
 * (`monitoramento-overview-lista.tsx`, pedido do usuário 2026-09-26): card
 * + `<table>` nativa + paginação (Seção 5 da constituição: numérico à
 * direita). */
export function RelatorioPropostasTabela({
  titulo,
  itens,
}: {
  titulo: string;
  itens: PropostaCandidata[];
}) {
  const [pagina, setPagina] = useState(1);
  const paginaAtual = itens.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  return (
    <div className={estiloCard}>
      <div className="mb-3 flex flex-wrap justify-between gap-2.5">
        <strong className="text-sm">
          {titulo} ({itens.length})
        </strong>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground uppercase">
              <th className="px-2 py-1">Proposta/Parceria</th>
              <th className="px-2 py-1">Proponente</th>
              <th className="px-2 py-1">Município/UF</th>
              <th className="px-2 py-1">Programa</th>
              <th className="px-2 py-1">Situação</th>
              <th className="px-2 py-1 text-right">Valor global</th>
              <th className="px-2 py-1 text-right">Data</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-2 py-3.5 text-center text-muted-foreground italic"
                >
                  Nenhuma linha de financiamento bate com esse filtro.
                </td>
              </tr>
            ) : (
              paginaAtual.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-2 py-1.5 font-semibold">
                    {item.cd_parceria ?? item.id_proposta}
                  </td>
                  <td className="px-2 py-1.5">{item.nm_proponente}</td>
                  <td className="px-2 py-1.5">
                    {item.municipio ?? "—"}/{item.uf ?? "—"}
                  </td>
                  <td className="px-2 py-1.5">{item.nm_programa}</td>
                  <td className="px-2 py-1.5">{situacaoDeFato(item) ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    {fmtMoeda(item.vl_global_proposta)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {fmtData(item.data_proposta)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {itens.length > 0 && (
        <Pagination
          page={pagina}
          totalItems={itens.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPagina}
        />
      )}
    </div>
  );
}
