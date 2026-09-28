/**
 * Pagina de overview do monitoramento interno -- INDEPENDENTE da página de
 * DETALHE de 1 instrumento (MonitoramentoInstrumentoPage.tsx); esta é o
 * índice/dashboard que reúne todos os instrumentos monitorados (105+ a
 * partir da planilha real da equipe, ver
 * backend/scripts/importar_planilha_monitoramento.py).
 *
 * KPIs/listas vem de `/monitoramento/resumo` + `/monitoramento/instrumentos`
 * (backend, NOSSO schema -- instrumento/evento/acao), via
 * `services/monitoramento.ts` (cookie de sessão).
 */
import { PageHeader } from "@/components/common/page-header";
import { MetricStrip } from "@/components/common/metric-strip";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitoramentoResumo } from "@/hooks/useMonitoramentoResumo";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useMonitoramentoInternoFiltros } from "@/hooks/use-monitoramento-interno-filtros";
import { MonitoramentoInternoFiltros } from "@/components/features/monitoramento-interno-filtros";
import {
  MonitoramentoOverviewLista,
  type InstrumentoResumo,
} from "@/components/features/monitoramento-overview-lista";
import { fmtData } from "@/lib/monitoramento-format";

export function MonitoramentoOverviewPage() {
  const resumoQuery = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const instrumentos = (instrumentosQuery.data ?? []) as InstrumentoResumo[];
  const filtros = useMonitoramentoInternoFiltros(instrumentos);

  const header = (
    <PageHeader
      eyebrow="Monitoramento interno"
      title="Mesa de trabalho"
      description="Entrega, instalação, licenciamento CNEN e inauguração."
    />
  );

  if (resumoQuery.isError || instrumentosQuery.isError) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar os dados do monitoramento interno."
          onRetry={() => {
            resumoQuery.refetch();
            instrumentosQuery.refetch();
          }}
        />
      </div>
    );
  }
  if (
    resumoQuery.isLoading ||
    instrumentosQuery.isLoading ||
    !resumoQuery.data ||
    !instrumentosQuery.data
  ) {
    return (
      <div>
        {header}
        <div className="grid gap-2" role="status" aria-label="Carregando">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const resumo = resumoQuery.data;
  const instrumentosFiltrados = filtros.filtrados;

  // "Próxima inauguração" -- a mais próxima AINDA NÃO realizada E ainda no
  // futuro, ordenada por data (resumo.inauguracoes já vem ordenado por data
  // asc, ver obter_resumo no backend). Uma previsão vencida sem confirmação
  // é uma pendência atrasada, não uma "próxima" -- achado 2026-09-18: o
  // filtro antigo (só `!realizada`) apontava pra previsão mais antiga já no
  // passado em vez da mais próxima no futuro.
  const proximaInauguracao =
    resumo.inauguracoes.find((i) => !i.realizada && i.dias >= 0) ?? null;

  // "Concluídos" -- Plan Mode monitoramento-evolucao 2026-09-19: passou a
  // contar por `fase_atual === 'Concluído'` (marco de fase geral, mesmo
  // catálogo pro instrumento inteiro), não mais por
  // `situacao_prestacao_contas` (SICONV legado, só existia pra tipo_
  // contratacao="Convênio" -- FAF/TED/PERSUS nunca tinham esse dado).
  const concluidos = instrumentosFiltrados.filter(
    (i) => i.fase_atual === "Concluído",
  ).length;

  // Configuração pendente -- incluir uma proposta em "Linhas de
  // financiamento" cria o InstrumentoEquipamento (entra na contagem
  // "Instrumentos" acima) já exige técnico titular na inclusão, mas ainda
  // pode depender de preencher nível e demais dados de acompanhamento.
  // `tecnico_titular` null é o sinal mais direto de "ainda não
  // configurado" (primeiro campo que qualquer cadastro preenche).
  const configuracaoPendente = instrumentosFiltrados.filter(
    (i) => !i.tecnico_titular,
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Monitoramento interno"
        title="Mesa de trabalho"
        description="Entrega, instalação, licenciamento CNEN e inauguração."
      />

      <MonitoramentoInternoFiltros filtros={filtros} />

      {/* Próxima inauguração mostra o detalhe disponível hoje (data/
          município/UF/equipamento). Instrumentos/Execução média saíram
          pra não duplicar os cards do cabeçalho acima. */}
      <div className="mb-6">
        <MetricStrip
          items={[
            {
              key: "instrumentos",
              label: "Instrumentos",
              value: instrumentosFiltrados.length,
            },
            {
              key: "execucao",
              label: "Execução média",
              value:
                resumo.pct_execucao_fisica_medio != null
                  ? `${Math.round(resumo.pct_execucao_fisica_medio * 100)}%`
                  : "—",
            },
            {
              key: "licencas",
              label: "Licenças a vencer",
              value: resumo.licencas_vencendo.length,
              variant: resumo.licencas_vencendo.length ? "warning" : "success",
            },
            {
              key: "inauguracao",
              label: "Próxima inauguração",
              value: proximaInauguracao
                ? fmtData(proximaInauguracao.data)
                : "—",
              variant: "primary",
            },
            {
              key: "concluidos",
              label: "Concluídos",
              value: concluidos,
              variant: "success",
            },
            {
              key: "pendentes",
              label: "Sem técnico",
              value: configuracaoPendente,
              variant: configuracaoPendente ? "warning" : "success",
            },
          ]}
        />
      </div>

      <MonitoramentoOverviewLista instrumentos={instrumentosFiltrados} />
    </div>
  );
}
