import { Link } from "react-router-dom";
import { Pagination } from "@/components/common/pagination";
import { useListaPaginada } from "@/hooks/useListaPaginada";
import { cn } from "@/lib/utils";
import type {
  AcaoAbertaResumo,
  DivergenciaConclusao,
  InauguracaoResumo,
  LicencaVencendoResumo,
} from "@/services/monitoramento-resumo";
import { AgendaExecutiva } from "./monitoramento-painel-agenda";
import { DivergenciasConclusao } from "./monitoramento-painel-divergencias";
import { MonitoramentoPainelVigencias } from "./monitoramento-painel-vigencias";
import { PainelSecao } from "./monitoramento-painel-visuals";

interface Props {
  vigencias: Array<{
    nr_convenio: string;
    nome_convenente: string;
    data_final: string;
    dias: number;
  }>;
  licencas: LicencaVencendoResumo[];
  inauguracoes: InauguracaoResumo[];
  divergencias: DivergenciaConclusao[];
  divergenciasPorFonte: string;
  semTecnico: number;
  acoesAtrasadas: number;
  acoesPendentes: number;
  licencasCnenDeferidas: { quantidade: number; total: number };
  acoes: AcaoAbertaResumo[];
  filaTruncada: boolean;
}

export function MonitoramentoPainelPendencias({
  vigencias,
  licencas,
  inauguracoes,
  divergencias,
  divergenciasPorFonte,
  semTecnico,
  acoesAtrasadas,
  acoesPendentes,
  licencasCnenDeferidas,
  acoes,
  filaTruncada,
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
  const {
    pagina: paginaAcoes,
    definirPagina: definirPaginaAcoes,
    inicio: inicioAcoes,
  } = useListaPaginada(acoes.length, 8, acoes.map((acao) => acao.id).join("|"));
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

      <MonitoramentoPainelVigencias vigencias={vigencias} />

      <div className="mt-7 grid gap-x-9 gap-y-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <PainelSecao
          titulo="Agenda de prazos"
          apoio="Licenças e inaugurações por proximidade"
          className="flex min-w-0 flex-col"
        >
          <AgendaExecutiva inauguracoes={inauguracoes} licencas={licencas} />
        </PainelSecao>
        <PainelSecao
          titulo="Divergências de conclusão"
          apoio={
            divergenciasPorFonte || `${divergencias.length} casos no recorte`
          }
          className="flex min-w-0 flex-col"
        >
          <DivergenciasConclusao itens={divergencias} />
        </PainelSecao>
      </div>

      <PainelSecao
        titulo="Fila de ações"
        apoio={`${acoesPendentes} pendentes no recorte`}
        className="mt-8"
      >
        {acoes.length ? (
          <div className="divide-y divide-border">
            {acoes.slice(inicioAcoes, inicioAcoes + 8).map((acao) => (
              <Link
                key={acao.id}
                to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(acao.nr_convenio)}`}
                className="group grid gap-1 py-3 text-sm transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
              >
                <span className="min-w-0">
                  <strong className="block font-semibold text-foreground group-hover:text-primary">
                    {acao.descricao}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {acao.nome_convenente} ·{" "}
                    {acao.responsavel ?? "Responsável não definido"}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold sm:text-right",
                    acao.dias != null && acao.dias < 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {acao.dias == null
                    ? "Sem prazo"
                    : acao.dias < 0
                      ? `${Math.abs(acao.dias)} dias de atraso`
                      : acao.dias === 0
                        ? "Vence hoje"
                        : `Em ${acao.dias} dias`}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            Nenhuma ação pendente neste recorte.
          </p>
        )}
        {acoes.length > 0 && (
          <nav aria-label="Paginação da fila de ações">
            <Pagination
              page={paginaAcoes}
              totalItems={acoes.length}
              pageSize={8}
              onPageChange={definirPaginaAcoes}
            />
          </nav>
        )}
        {filaTruncada && (
          <p className="mt-2 text-xs text-muted-foreground">
            A lista mostra as primeiras 500 ações por prazo; a contagem inclui
            todas as ações vigentes.
          </p>
        )}
      </PainelSecao>

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
              Licenças CNEN deferidas
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
