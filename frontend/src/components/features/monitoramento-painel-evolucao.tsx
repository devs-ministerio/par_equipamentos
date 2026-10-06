import { Link } from "react-router-dom";
import { fmtMoeda } from "@/lib/monitoramento-format";
import type { AuthUser } from "@/services/auth";
import {
  COR_PREVISTA,
  COR_REALIZADA,
} from "@/lib/monitoramento-painel-palette";

interface Props {
  inauguracoesPorAno: Array<{
    ano: string;
    realizadas: number;
    previstas: number;
  }>;
  previsoesVencidas: number;
  porTipo: Array<{
    rotulo: string;
    quantidade: number;
    comValor: number;
    valor: number;
  }>;
  total: number;
  semCnes: number;
  semCoordenadas: number;
  semTecnico: number;
  semAno: number;
  comPagamentoDeterminado: number;
  cargasManuais: number;
  viewerRole?: AuthUser["role"];
}

export function MonitoramentoPainelEvolucao({
  inauguracoesPorAno,
  previsoesVencidas,
  porTipo,
  total,
  semCnes,
  semCoordenadas,
  semTecnico,
  semAno,
  comPagamentoDeterminado,
  cargasManuais,
  viewerRole,
}: Props) {
  const isAdmin = viewerRole === "admin";
  const mostraPrevisoesVencidas = isAdmin || viewerRole === "gestor";
  const anoCorrente = new Date().getFullYear();
  const anos = inauguracoesPorAno.slice(-8);
  const maximo = Math.max(
    1,
    ...anos.map((item) => Math.max(item.realizadas, item.previstas)),
  );
  const maiorValor = Math.max(1, ...porTipo.map((item) => item.valor));
  const qualidade = [
    { rotulo: "CNES vinculado", valor: total - semCnes },
    { rotulo: "Coordenadas CNES", valor: total - semCoordenadas },
    { rotulo: "Técnico titular", valor: total - semTecnico },
    { rotulo: "Ano do instrumento", valor: total - semAno },
    { rotulo: "Base de pagamento", valor: comPagamentoDeterminado },
  ];

  return (
    <section
      className="mt-9 border-t border-border pt-6"
      aria-labelledby="evolucao-painel-titulo"
    >
      <h2
        id="evolucao-painel-titulo"
        className="font-display text-2xl font-semibold tracking-tight"
      >
        Evolução e Qualidade
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Inaugurações e investimento por contratação no recorte selecionado.
      </p>

      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 border-t border-border pt-4">
          <h3 className="text-base font-semibold">Ano de inauguração</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Por data do marco vigente; previsões futuras não são realizações.
          </p>
          <div
            className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
            aria-label="Legenda das inaugurações"
          >
            <span className="inline-flex items-center gap-2">
              <i
                aria-hidden="true"
                className="size-2.5"
                style={{ backgroundColor: COR_REALIZADA }}
              />
              Realizadas
            </span>
            <span className="inline-flex items-center gap-2">
              <i
                aria-hidden="true"
                className="size-2.5"
                style={{ backgroundColor: COR_PREVISTA }}
              />
              Previstas
            </span>
          </div>
          {anos.length ? (
            <div
              className="mt-5 flex h-52 items-end gap-1 border-b border-border pb-1 sm:gap-3"
              role="img"
              aria-label={anos
                .map(
                  (item) =>
                    `${item.ano}: ${item.realizadas} realizadas${Number(item.ano) >= anoCorrente ? `, ${item.previstas} previstas` : ""}`,
                )
                .join("; ")}
            >
              {anos.map((item) => (
                <div
                  key={item.ano}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  <div
                    className="grid h-[174px] w-full grid-cols-2 items-end gap-px"
                    aria-hidden="true"
                  >
                    <div
                      className={`flex h-full min-w-0 flex-col items-center justify-end gap-1 ${Number(item.ano) < anoCorrente ? "translate-x-1/2" : ""}`}
                    >
                      {item.realizadas > 0 && (
                        <span className="font-data text-[10px] font-semibold tabular-nums">
                          {item.realizadas}
                        </span>
                      )}
                      <div
                        title={`${item.ano}: ${item.realizadas} realizadas`}
                        className="w-full"
                        style={{
                          backgroundColor: COR_REALIZADA,
                          height: item.realizadas
                            ? `${Math.max(4, (item.realizadas / maximo) * 145)}px`
                            : 0,
                        }}
                      />
                    </div>
                    {Number(item.ano) >= anoCorrente && (
                      <div className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
                        {item.previstas > 0 && (
                          <span className="font-data text-[10px] font-semibold tabular-nums">
                            {item.previstas}
                          </span>
                        )}
                        <div
                          title={`${item.ano}: ${item.previstas} previstas`}
                          className="w-full"
                          style={{
                            backgroundColor: COR_PREVISTA,
                            height: item.previstas
                              ? `${Math.max(4, (item.previstas / maximo) * 145)}px`
                              : 0,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <span className="font-data text-[11px] tabular-nums text-muted-foreground">
                    {item.ano}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Nenhuma data de inauguração registrada neste recorte.
            </p>
          )}
          {mostraPrevisoesVencidas && previsoesVencidas > 0 && (
            <p className="mt-3 text-xs text-destructive">
              {previsoesVencidas} previsões vencidas aparecem na agenda de
              pendências, não na série futura.
            </p>
          )}
          {inauguracoesPorAno.length > 8 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Exibidos os oito anos mais recentes.
            </p>
          )}
        </div>

        <div className="min-w-0 border-t border-border pt-4">
          <h3 className="text-base font-semibold">
            Investimento por contratação
          </h3>
          {porTipo.length ? (
            <div className="mt-4 divide-y divide-border">
              {porTipo.map((item) => (
                <div key={item.rotulo} className="py-3">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span
                      className="min-w-0 truncate font-medium"
                      title={item.rotulo}
                    >
                      {item.rotulo}{" "}
                      <span className="text-muted-foreground">
                        ({item.quantidade})
                      </span>
                    </span>
                    <strong className="shrink-0 text-right font-data tabular-nums">
                      {item.comValor ? fmtMoeda(item.valor) : "—"}
                    </strong>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.comValor}/{item.quantidade} com valor informado
                  </p>
                  <div className="mt-2 h-1.5 bg-muted" aria-hidden="true">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(item.valor / maiorValor) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Nenhum instrumento neste recorte.
            </p>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-8 border-t border-border pt-4">
          <h3 className="text-base font-semibold">Completude do recorte</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
            {qualidade.map((item, index) => {
              const percentual = total
                ? Math.round((item.valor / total) * 100)
                : 0;
              return (
                <div
                  key={item.rotulo}
                  className={`min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4 ${index === qualidade.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}
                >
                  <p className="min-h-8 text-xs font-medium leading-4 text-muted-foreground sm:min-h-0">
                    {item.rotulo}
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <strong className="font-data text-lg font-semibold tabular-nums tracking-tight text-foreground">
                      {item.valor}/{total}
                    </strong>
                    <span className="font-data text-xs font-semibold tabular-nums text-muted-foreground">
                      {percentual}%
                    </span>
                  </div>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded-full ${percentual === 100 ? "bg-success" : percentual === 0 ? "bg-destructive" : "bg-warning"}`}
                      style={{ width: `${percentual}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {!total && (
            <Link
              to="/monitoramento-equipamentos/instrumentos"
              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Ver instrumentos
            </Link>
          )}
          {cargasManuais > 0 && (
            <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground sm:px-4">
              {cargasManuais} cargas manuais têm valor global informado e
              desembolso integral por regra da fonte. Pagamento ao fornecedor só
              é assumido quando a fase interna está concluída.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
