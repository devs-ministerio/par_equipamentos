import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitoramentoResumo } from "@/hooks/useMonitoramentoResumo";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useMonitoramentoMarcos } from "@/hooks/useMonitoramentoMarcos";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useMonitoramentoInternoFiltros } from "@/hooks/use-monitoramento-interno-filtros";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { montarMetricasPainel } from "@/lib/monitoramento-painel-metricas";
import { MetricStrip } from "@/components/common/metric-strip";
import {
  DistribuicaoHorizontal,
  PainelSecao,
} from "@/components/features/monitoramento-painel-visuals";
import { MonitoramentoInternoFiltros } from "@/components/features/monitoramento-interno-filtros";
import { MonitoramentoPainelGeografia } from "@/components/features/monitoramento-painel-geografia";
import { MonitoramentoPainelAnalises } from "@/components/features/monitoramento-painel-analises";
import { MonitoramentoPainelPendencias } from "@/components/features/monitoramento-painel-pendencias";
import { MonitoramentoPainelEvolucao } from "@/components/features/monitoramento-painel-evolucao";

const header = (
  <PageHeader
    eyebrow="Monitoramento interno"
    title="Painel de gestão"
    description="Execução física, distribuição territorial e pendências dos instrumentos monitorados."
  />
);

export function MonitoramentoPainelPage() {
  const resumoQuery = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const marcosQuery = useMonitoramentoMarcos();
  const conveniosQuery = useConveniosLista();
  const sessao = useAuthSession();
  const resumo = resumoQuery.data;
  const instrumentos = instrumentosQuery.data;
  const filtros = useMonitoramentoInternoFiltros(instrumentos ?? []);
  const marcos = marcosQuery.data;
  const convenios = conveniosQuery.data?.itens;

  if (
    resumoQuery.isError ||
    instrumentosQuery.isError ||
    marcosQuery.isError ||
    conveniosQuery.isError
  ) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar o painel de gestão."
          onRetry={() => {
            resumoQuery.refetch();
            instrumentosQuery.refetch();
            marcosQuery.refetch();
            conveniosQuery.refetch();
          }}
        />
      </div>
    );
  }
  if (!resumo || !instrumentos || !marcos || !convenios) {
    return (
      <div>
        {header}
        <div className="grid gap-3" role="status" aria-label="Carregando">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const instrumentosFiltrados = filtros.filtrados;
  const dados = montarMetricasPainel(instrumentosFiltrados, resumo, convenios);
  const fases = [
    "Não iniciado",
    ...marcos
      .filter(
        (marco) =>
          marco.grupo === "fase_geral" && marco.rotulo !== "Não iniciado",
      )
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((marco) => marco.rotulo),
  ];
  const divergenciasPorFonte = [
    ...dados.divergencias
      .reduce((contagem, item) => {
        const fonte = item.fonte_externa;
        contagem.set(fonte, (contagem.get(fonte) ?? 0) + 1);
        return contagem;
      }, new Map<string, number>())
      .entries(),
  ]
    .map(([fonte, quantidade]) => `${fonte}: ${quantidade}`)
    .join(" · ");

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow="Monitoramento interno"
        title="Painel de gestão"
        description="Execução física, distribuição territorial e pendências dos instrumentos monitorados."
      />
      <MonitoramentoInternoFiltros filtros={filtros} />
      <MetricStrip
        items={[
          {
            key: "instrumentos",
            label: "Instrumentos",
            value: instrumentosFiltrados.length,
            detail: `${dados.fases.find((fase) => fase.rotulo === "Concluído")?.quantidade ?? 0} em fase concluída`,
          },
          {
            key: "fase",
            label: "Progresso de fase · referência",
            value:
              dados.pctReferenciaMedio == null
                ? "—"
                : `${Math.round(dados.pctReferenciaMedio * 100)}%`,
          },
          {
            key: "valor-global",
            label: "Valor global informado",
            value: dados.instrumentosComValor
              ? fmtMoeda(dados.valorGlobal)
              : "—",
            detail:
              dados.percentualPagoComRegra == null
                ? "Pagamento ao fornecedor sem base comparável"
                : `${Math.round(dados.percentualPagoComRegra * 100)}% pago ao fornecedor`,
          },
          {
            key: "atencao",
            label: "Pontos de atenção",
            value: dados.pontosAtencao,
            variant: dados.pontosAtencao > 0 ? "destructive" : "success",
          },
        ]}
      />

      <MonitoramentoPainelGeografia instrumentos={instrumentosFiltrados} />

      <MonitoramentoPainelAnalises
        instrumentos={instrumentosFiltrados}
        fases={fases}
      />

      <PainelSecao
        titulo="Composição da carteira"
        apoio={`${instrumentosFiltrados.length} instrumentos monitorados`}
        className="mt-8"
      >
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
              Por equipamento
            </h4>
            <DistribuicaoHorizontal itens={dados.porEquipamento} limite={7} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
              Por técnico titular
            </h4>
            <DistribuicaoHorizontal itens={dados.porTecnico} limite={6} />
          </div>
        </div>
      </PainelSecao>

      <MonitoramentoPainelEvolucao
        inauguracoesPorAno={dados.inauguracoesPorAno}
        previsoesVencidas={dados.previsoesVencidasForaDaSerie}
        porTipo={dados.porTipo}
        total={instrumentosFiltrados.length}
        semCnes={dados.semCnes}
        semCoordenadas={dados.semCoordenadas}
        semTecnico={dados.semTecnico}
        semAno={dados.semAno}
        comPagamentoDeterminado={
          dados.instrumentosComPagamento + dados.pagamentosManuaisConcluidos
        }
        cargasManuais={dados.cargasManuais}
        viewerRole={sessao.usuarioAtual?.role}
      />

      <MonitoramentoPainelPendencias
        vigencias={dados.vigenciasProximas}
        licencas={dados.licencas}
        inauguracoes={dados.inauguracoes}
        divergencias={dados.divergencias}
        divergenciasPorFonte={divergenciasPorFonte}
        semTecnico={dados.semTecnico}
        acoesAtrasadas={dados.acoesAtrasadas}
        acoesPendentes={dados.acoesPendentes}
        licencasCnenDeferidas={{
          quantidade: dados.licencasDeferidas,
          total: instrumentosFiltrados.length,
        }}
        acoes={dados.acoes}
        filaTruncada={resumo.fila_acoes_truncada}
      />
    </div>
  );
}
