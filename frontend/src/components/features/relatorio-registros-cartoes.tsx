import type { ReactNode } from "react";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { localDaLinha, type LinhaRelatorio } from "@/lib/relatorio-linhas";
import {
  EtiquetasDoRegistro,
  SituacaoDaLinha,
} from "./relatorio-registro-celulas";

export function RelatorioRegistrosCartoes({
  itens,
  vazio,
}: {
  itens: LinhaRelatorio[];
  vazio: ReactNode;
}) {
  return (
    <div className="divide-y divide-border xl:hidden">
      {itens.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
          {vazio}
        </div>
      ) : (
        itens.map((item) => (
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
  );
}
