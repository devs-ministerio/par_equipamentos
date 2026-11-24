import type { ReactNode } from "react";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { estiloCard } from "@/components/features/monitoramento-ui";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { localDaLinha, type LinhaRelatorio } from "@/lib/relatorio-linhas";
import {
  EquipamentosDaLinha,
  EtiquetasDoRegistro,
  SituacaoDaLinha,
} from "./relatorio-registro-celulas";

const PAGE_SIZE = 20;
const COLUNAS = ["14%", "26%", "18%", "14%", "12%", "6%", "10%"];
const CABECALHO =
  "px-3 py-3 text-center align-middle text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase";

/** Prévia do recorte: a mesma lista que o arquivo traz, numa tabela só.
 *  Largura em porcentagem (`table-fixed`), sem rolagem horizontal; o texto
 *  longo quebra em vez de cortar. Abaixo de `xl` vira lista de cartões. */
export function RelatorioRegistrosTabela({
  itens,
  onLimparFiltros,
  eyebrow = "Prévia",
  titulo = "Conteúdo do relatório",
  idTitulo = "relatorio-registros-titulo",
  filtrosAtivos,
}: {
  itens: LinhaRelatorio[];
  onLimparFiltros?: () => void;
  eyebrow?: string;
  titulo?: string;
  idTitulo?: string;
  /** Filtros ativos e "Limpar filtros", no canto do cabeçalho. */
  filtrosAtivos?: ReactNode;
}) {
  const { pagina, definirPagina, inicio } = useListaPaginada(
    itens.length,
    PAGE_SIZE,
    itens.map((item) => item.chave).join("|"),
  );
  const paginaAtual = itens.slice(inicio, inicio + PAGE_SIZE);
  const vazio = (
    <>
      <span>Nenhum registro bate com esse filtro.</span>
      {onLimparFiltros && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLimparFiltros}
        >
          Limpar filtros
        </Button>
      )}
    </>
  );

  return (
    <section className={estiloCard} aria-labelledby={idTitulo}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
          <h2
            id={idTitulo}
            className="mt-2 font-display text-xl font-bold tracking-[-0.035em] text-foreground sm:text-2xl"
          >
            {titulo}
          </h2>
        </div>
        {filtrosAtivos}
      </header>

      <div className="hidden overflow-hidden rounded-xl border border-border xl:block">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <colgroup>
            {COLUNAS.map((largura, i) => (
              <col key={i} style={{ width: largura }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/65">
              <th className={CABECALHO}>Número</th>
              <th className={CABECALHO}>Estabelecimento</th>
              <th className={CABECALHO}>Equipamento</th>
              <th className={CABECALHO}>Situação (Site)</th>
              <th className={CABECALHO}>Monitoramento</th>
              <th className={CABECALHO}>Ano</th>
              <th className={CABECALHO}>Valor global</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {itens.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUNAS.length}
                  className="px-3 py-3.5 text-center text-muted-foreground italic"
                >
                  <div className="flex flex-col items-center gap-2 py-3">
                    {vazio}
                  </div>
                </td>
              </tr>
            ) : (
              paginaAtual.map((item) => (
                <tr
                  key={item.chave}
                  className="align-middle transition-colors duration-150 hover:bg-muted/35"
                >
                  <td className="px-3 py-3.5 text-center">
                    <span
                      className="block break-all font-mono text-[11px] font-semibold"
                      title={item.numero}
                    >
                      {item.numero}
                    </span>
                    <EtiquetasDoRegistro linha={item} centralizado />
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="block break-words font-semibold leading-snug text-foreground">
                      {item.estabelecimento}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-1.5 text-[11.5px] text-muted-foreground">
                      <span>{localDaLinha(item)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">CNES {item.cnes ?? "—"}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3.5 break-words text-foreground/90">
                    <EquipamentosDaLinha equipamentos={item.equipamentos} />
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <SituacaoDaLinha texto={item.situacao} />
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <SituacaoDaLinha texto={item.monitoramento} />
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums">
                    {item.ano ?? "—"}
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums">
                    {fmtMoeda(item.valor)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border xl:hidden">
        {itens.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
            {vazio}
          </div>
        ) : (
          paginaAtual.map((item) => (
            <article key={item.chave} className="py-4 first:pt-1 last:pb-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-muted-foreground">
                    {item.numero}
                  </p>
                  <h3 className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">
                    {item.estabelecimento}
                  </h3>
                </div>
                <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                  {fmtMoeda(item.valor)}
                </p>
              </div>
              <EtiquetasDoRegistro linha={item} />
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {localDaLinha(item)} · CNES {item.cnes ?? "—"}
              </p>
              <p className="mt-1 break-words text-xs leading-relaxed text-foreground">
                {item.equipamentos.join(", ") || "Equipamento não informado"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {item.situacao && <SituacaoDaLinha texto={item.situacao} />}
                {item.monitoramento && (
                  <SituacaoDaLinha texto={item.monitoramento} />
                )}
                <span className="text-[11px] text-muted-foreground">
                  Ano {item.ano ?? "—"}
                </span>
              </div>
            </article>
          ))
        )}
      </div>

      {itens.length > 0 && (
        <Pagination
          page={pagina}
          totalItems={itens.length}
          pageSize={PAGE_SIZE}
          onPageChange={definirPagina}
        />
      )}
    </section>
  );
}
