import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { useMemo } from "react";
import { PageHeader } from "@/components/common/page-header";
import { CardColaborador } from "@/components/features/card-colaborador";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitoramentoResumo } from "@/hooks/useMonitoramentoResumo";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useMonitoramentoMarcos } from "@/hooks/useMonitoramentoMarcos";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useMonitoramentoInternoFiltros } from "@/hooks/use-monitoramento-interno-filtros";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { rotulosEquipamentoDoInstrumento } from "@/lib/monitoramento-filtro-equipamentos";
import { montarMetricasPainel } from "@/lib/monitoramento-painel-metricas";
import { MetricStrip } from "@/components/common/metric-strip";
import { MonitoramentoInternoFiltros } from "@/components/features/monitoramento-interno-filtros";
import { MonitoramentoPainelGeografia } from "@/components/features/monitoramento-painel-geografia";
import { entreguesPorFamilia } from "@/lib/equipamentos-entregues";
import {
  PainelBloco,
  PainelNavegacao,
} from "@/components/features/painel-tecnico-estrutura";
import { SecaoEquipamentos } from "@/components/features/painel-tecnico-equipamentos";
import { PainelCartao } from "@/components/features/painel-gestao-cartao";
import {
  GraficoColunas,
  LegendaSegmentos,
} from "@/components/features/painel-gestao-colunas";
import { GraficoRosca } from "@/components/features/painel-gestao-rosca";
import { RankingBarras } from "@/components/features/painel-gestao-ranking";
import { PainelGestaoCompletude } from "@/components/features/painel-gestao-completude";
import { resumirCarteiraPainel } from "@/lib/monitoramento-painel-analise";
import {
  COR_PREVISTA,
  COR_REALIZADA,
  corDaContratacao,
  corDaFase,
} from "@/lib/monitoramento-painel-palette";

const SECOES = [
  { id: "visao-geral", rotulo: "Visão geral" },
  { id: "evolucao", rotulo: "Evolução" },
  { id: "composicao", rotulo: "Composição" },
  { id: "territorio", rotulo: "Território" },
];

const header = (
  <PageHeader
    eyebrow="Monitoramento interno"
    title="Painel de gestão"
    actions={<CardColaborador />}
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
  const filtros = useMonitoramentoInternoFiltros(
    instrumentos ?? [],
    conveniosQuery.data?.itens ?? [],
    resumo?.inauguracoes ?? null,
  );
  const marcos = marcosQuery.data;
  const convenios = conveniosQuery.data?.itens;
  const equipamentosPorNumero = useMemo(
    () =>
      new Map(
        (convenios ?? []).map((item) => [
          item.numero,
          rotulosEquipamentoDoInstrumento(item.equipamentos),
        ]),
      ),
    [convenios],
  );

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
  const fases = [...FASES_ACOMPANHAMENTO];
  const analise = resumirCarteiraPainel(instrumentosFiltrados, fases);
  const total = instrumentosFiltrados.length;
  const isAdmin = sessao.usuarioAtual?.role === "admin";
  const mostraVencidas = isAdmin || sessao.usuarioAtual?.role === "gestor";
  const numeros = new Set(instrumentosFiltrados.map((i) => i.nr_convenio));
  const familias = entreguesPorFamilia(
    resumo.equipamentos_por_instrumento,
    numeros,
  );
  const anosInauguracao = dados.inauguracoesPorAno.slice(-8);
  const contratacoes = analise.contratacoes.map((c) => ({
    rotulo: c.rotulo,
    valor: c.quantidade,
    cor: corDaContratacao(c.rotulo),
  }));
  const pago =
    dados.percentualPagoComRegra == null
      ? null
      : Math.round(dados.percentualPagoComRegra * 100);

  return (
    <div className="space-y-6 pb-8">
      {header}
      <MonitoramentoInternoFiltros filtros={filtros} />
      <PainelNavegacao itens={SECOES} />
      <div className="space-y-12">
        <PainelBloco id="visao-geral" titulo="Visão geral">
          <MetricStrip
            items={[
              {
                key: "instrumentos",
                label: "Instrumentos",
                value: total,
                detail: `${dados.fases.find((fase) => fase.rotulo === "Concluído")?.quantidade ?? 0} em fase concluída`,
              },
              {
                key: "valor-global",
                label: "Valor global informado",
                value: dados.instrumentosComValor
                  ? fmtMoeda(dados.valorGlobal)
                  : "—",
                detail: (
                  <>
                    {pago == null
                      ? "Pagamento ao fornecedor sem base comparável"
                      : `${pago}% pago ao fornecedor`}
                    <br />
                    {`Valor de ${dados.instrumentosComValor} de ${total} instrumentos`}
                    {dados.pagamentosManuaisConcluidos > 0 &&
                      ` · ${dados.pagamentosManuaisConcluidos} com quitação assumida pela regra da carga concluída (não é pagamento registrado)`}
                  </>
                ),
              },
              {
                key: "atencao",
                label: "Instrumentos com atenção",
                value: dados.instrumentosEmAtencao,
                variant:
                  dados.instrumentosEmAtencao > 0 ? "destructive" : "success",
                detail: `${dados.pontosAtencao} ocorrências: ${dados.acoesAtrasadas} ações atrasadas, ${dados.inauguracoesAtrasadas} inaugurações atrasadas, ${dados.licencasCriticas} licenças críticas, ${dados.divergencias.length} divergências externas`,
              },
            ]}
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PainelCartao titulo="Instrumentos por situação">
              <GraficoColunas
                vazio="Nenhum instrumento neste recorte."
                colunas={analise.fases.map((f) => ({
                  rotulo: f.rotulo,
                  segmentos: [
                    {
                      nome: f.rotulo,
                      valor: f.quantidade,
                      cor: corDaFase(f.rotulo, fases),
                    },
                  ],
                }))}
              />
            </PainelCartao>
            <SecaoEquipamentos familias={familias} />
          </div>
        </PainelBloco>

        <PainelBloco id="evolucao" titulo="Evolução">
          <div className="grid gap-6 lg:grid-cols-2">
            <PainelCartao
              titulo="Ano do instrumento"
              apoio={
                [
                  analise.anosOmitidos > 0
                    ? `${analise.anosOmitidos} anos anteriores não exibidos`
                    : "",
                  analise.semAno > 0 ? `${analise.semAno} sem ano` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              <GraficoColunas
                vazio="Nenhum ano informado."
                colunas={analise.anos.map((a) => ({
                  rotulo: a.rotulo,
                  segmentos: [
                    {
                      nome: "Instrumentos",
                      valor: a.quantidade,
                      cor: COR_REALIZADA,
                    },
                  ],
                }))}
              />
            </PainelCartao>
            <PainelCartao
              titulo="Ano de inauguração"
              apoio={
                mostraVencidas && dados.previsoesVencidasForaDaSerie > 0
                  ? `${dados.previsoesVencidasForaDaSerie} previsões vencidas fora da série`
                  : undefined
              }
            >
              <LegendaSegmentos
                itens={[
                  { nome: "Realizadas", cor: COR_REALIZADA },
                  { nome: "Previstas", cor: COR_PREVISTA },
                ]}
              />
              <GraficoColunas
                vazio="Nenhuma data de inauguração registrada neste recorte."
                colunas={anosInauguracao.map((a) => ({
                  rotulo: a.ano,
                  segmentos: [
                    {
                      nome: "Realizadas",
                      valor: a.realizadas,
                      cor: COR_REALIZADA,
                    },
                    {
                      nome: "Previstas",
                      valor: a.previstas,
                      cor: COR_PREVISTA,
                    },
                  ],
                }))}
              />
            </PainelCartao>
          </div>
        </PainelBloco>

        <PainelBloco id="composicao" titulo="Composição">
          <div className="grid gap-6 lg:grid-cols-2">
            <PainelCartao titulo="Tipo de contratação">
              <GraficoRosca fatias={contratacoes} rotuloTotal="instrumentos" />
            </PainelCartao>
            <PainelCartao titulo="Investimento por contratação">
              <RankingBarras
                itens={dados.porTipo.map((t) => ({
                  rotulo: `${t.rotulo} (${t.comValor}/${t.quantidade})`,
                  valor: t.valor,
                  texto: t.comValor ? fmtMoeda(t.valor) : "—",
                }))}
              />
            </PainelCartao>
            <PainelCartao titulo="Valor global por situação">
              <RankingBarras
                limite={8}
                itens={fases
                  .map((f) => ({
                    rotulo: f,
                    valor: dados.valoresPorFase.get(f) ?? 0,
                  }))
                  .filter((f) => f.valor > 0)
                  .map((f) => ({ ...f, texto: fmtMoeda(f.valor) }))}
              />
            </PainelCartao>
            <PainelCartao
              titulo="Concentração por UF"
              apoio={`Top 5: ${analise.concentracaoTop5Uf}%`}
            >
              <RankingBarras
                limite={8}
                itens={analise.ufs.map((u) => ({
                  rotulo: u.rotulo,
                  valor: u.quantidade,
                }))}
              />
            </PainelCartao>
            <PainelCartao titulo="Instrumentos por equipamento">
              <RankingBarras
                itens={dados.porEquipamento.map((e) => ({
                  rotulo: e.rotulo,
                  valor: e.quantidade,
                }))}
              />
            </PainelCartao>
            <PainelCartao titulo="Instrumentos por técnico titular">
              <RankingBarras
                limite={8}
                itens={dados.porTecnico.map((t) => ({
                  rotulo: t.rotulo,
                  valor: t.quantidade,
                }))}
              />
            </PainelCartao>
          </div>
          {isAdmin && (
            <PainelGestaoCompletude
              total={total}
              semCnes={dados.semCnes}
              semCoordenadas={dados.semCoordenadas}
              semTecnico={dados.semTecnico}
              semAno={dados.semAno}
              comPagamentoDeterminado={
                dados.instrumentosComPagamento +
                dados.pagamentosManuaisConcluidos
              }
              cargasManuais={dados.cargasManuais}
            />
          )}
        </PainelBloco>

        <PainelBloco id="territorio" titulo="Território">
          <MonitoramentoPainelGeografia
            instrumentos={instrumentosFiltrados}
            equipamentosPorNumero={equipamentosPorNumero}
          />
        </PainelBloco>
      </div>
    </div>
  );
}
