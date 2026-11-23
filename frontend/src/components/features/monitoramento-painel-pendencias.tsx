import { cn } from "@/lib/utils";
import type {
  DivergenciaConclusao,
  InauguracaoResumo,
  LicencaVencendoResumo,
} from "@/services/monitoramento-resumo";
import { PainelSecao } from "./monitoramento-painel-visuals";

interface Props {
  licencas: LicencaVencendoResumo[];
  inauguracoes: InauguracaoResumo[];
  divergencias: DivergenciaConclusao[];
  semTecnico: number;
  acoesAtrasadas: number;
  acoesPendentes: number;
  licencasCnenDeferidas: { quantidade: number; total: number };
}

export function MonitoramentoPainelPendencias({
  licencas,
  inauguracoes,
  divergencias,
  semTecnico,
  acoesAtrasadas,
  acoesPendentes,
  licencasCnenDeferidas,
}: Props) {
  const licencasEmNoventaDias = licencas.filter(
    (item) => item.dias < 90,
  ).length;
  const inauguracoesAtrasadas = inauguracoes.filter(
    (item) => !item.realizada && item.dias < 0,
  ).length;
  const licencasVencidas = licencas.filter((item) => item.dias < 0).length;
  const licencasProximas = licencas.filter(
    (item) => item.dias >= 0 && item.dias < 90,
  ).length;
  const indicadores = [
    {
      rotulo: "Licenças em menos de 90 dias",
      valor: licencasEmNoventaDias,
      detalhe: `${licencasVencidas} vencidas · ${licencasProximas} próximas`,
    },
    {
      rotulo: "Inaugurações atrasadas",
      valor: inauguracoesAtrasadas,
      detalhe: "Previsões ainda abertas",
    },
    {
      rotulo: "Divergências externas",
      valor: divergencias.length,
      detalhe: "Conclusão não confirmada",
    },
    {
      rotulo: "Ações atrasadas",
      valor: acoesAtrasadas,
      detalhe: "Pendências vencidas",
    },
  ];

  return (
    <section
      className="mt-9 border-t border-border pt-6"
      aria-labelledby="pendencias-titulo"
    >
      <h2
        id="pendencias-titulo"
        className="font-display text-2xl font-semibold tracking-tight"
      >
        Prazos e pendências
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Prazos acompanhados, divergências externas e dados que exigem revisão.
      </p>

      <div
        className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-0 sm:border-y sm:border-border xl:grid-cols-4"
        aria-label="Resumo das pendências"
      >
        {indicadores.map((item, indice) => (
          <div
            key={item.rotulo}
            className={cn(
              "flex min-w-0 flex-col rounded-lg border border-border bg-card p-3 sm:block sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:py-4",
              indice % 2 === 1 && "sm:border-l",
              indice >= 2 && "sm:border-t xl:border-t-0",
              indice > 0 && "xl:border-l",
            )}
          >
            <p className="text-xs font-medium leading-4 text-muted-foreground">
              {item.rotulo}
            </p>
            <p
              className={cn(
                "mt-2 font-display text-2xl font-semibold tabular-nums sm:mt-1",
                item.valor != null && item.valor > 0 && "text-destructive",
              )}
            >
              {item.valor ?? "—"}
            </p>
            <p className="mt-auto pt-2 text-[11px] leading-4 text-muted-foreground sm:mt-1 sm:pt-0 sm:text-xs">
              {item.detalhe}
            </p>
          </div>
        ))}
      </div>

      <PainelSecao titulo="Qualidade do acompanhamento" className="mt-8">
        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-baseline justify-between gap-4 py-3 sm:pr-5">
            <span className="text-sm text-muted-foreground">
              Sem técnico titular
            </span>
            <strong
              className={cn(
                "font-data text-lg tabular-nums",
                semTecnico > 0 && "text-warning",
              )}
            >
              {semTecnico}
            </strong>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3 sm:px-5">
            <span className="text-sm text-muted-foreground">
              Ações pendentes
            </span>
            <strong className="font-data text-lg tabular-nums">
              {acoesPendentes}
            </strong>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3 sm:pl-5">
            <span className="text-sm text-muted-foreground">
              Licenças ANSN deferidas
            </span>
            <strong className="font-data text-lg tabular-nums">
              {`${licencasCnenDeferidas.quantidade}/${licencasCnenDeferidas.total}`}
            </strong>
          </div>
        </div>
      </PainelSecao>
    </section>
  );
}
