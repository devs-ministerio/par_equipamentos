import { useState } from "react";
import { Pagination } from "@/components/common/pagination";
import { estiloCard } from "@/components/features/monitoramento-ui";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import { situacaoDeFato } from "@/lib/proposta-status";
import { capitalizarNome } from "@/utils/texto";
import type { PropostaCandidata } from "@/services/propostas-candidatas";

const PAGE_SIZE = 20;

/** Tabela de prévia de "Linhas de financiamento" (propostas candidatas) do
 * relatório de Instrumentos e Repasse -- 1 componente reaproveitado nas 2
 * seções (Confirmada/Parceria e Em tramitação/Proposta, empilhadas uma
 * abaixo da outra, ver `estagioDeFato`), só troca `titulo`/`itens`. Mesmo
 * padrão de layout/formatação da tabela de Instrumentos Monitorados
 * (`monitoramento-overview-lista.tsx`): card + `<table>` nativa +
 * paginação (Seção 5 da constituição: numérico à direita). Larguras em
 * **porcentagem** (`table-fixed` + `<colgroup>`), mesma técnica de
 * `relatorio-instrumentos-tabela.tsx` -- nunca precisa de rolagem
 * horizontal (pedido do usuário 2026-09-26). Município também passa por
 * `capitalizarNome` (mesma normalização da tabela de Convênios -- sem
 * isso "SÃO PAULO" apareceria diferente de "São Paulo" na tela ao lado).
 * Proponente quebra texto (`whitespace-normal break-words`) em vez de
 * cortar com reticências (mesma correção 2026-09-26 da tabela de
 * Convênios) -- é o campo mais longo aqui (nome de instituição). */
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
      <table className="w-full table-fixed border-collapse text-[12.5px]">
        <colgroup>
          <col style={{ width: "8%" }} />
          <col style={{ width: "32%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "5%" }} />
        </colgroup>
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
                <td
                  className="truncate px-2 py-1.5 font-semibold"
                  title={String(item.cd_parceria ?? item.id_proposta)}
                >
                  {item.cd_parceria ?? item.id_proposta}
                </td>
                <td className="px-2 py-1.5 break-words whitespace-normal">
                  {item.nm_proponente}
                </td>
                <td
                  className="truncate px-2 py-1.5"
                  title={
                    item.municipio
                      ? `${capitalizarNome(item.municipio)}/${item.uf ?? "—"}`
                      : undefined
                  }
                >
                  {item.municipio ? capitalizarNome(item.municipio) : "—"}/
                  {item.uf ?? "—"}
                </td>
                <td className="px-2 py-1.5 break-words whitespace-normal">
                  {item.nm_programa}
                </td>
                <td
                  className="truncate px-2 py-1.5"
                  title={situacaoDeFato(item) ?? undefined}
                >
                  {situacaoDeFato(item) ?? "—"}
                </td>
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
