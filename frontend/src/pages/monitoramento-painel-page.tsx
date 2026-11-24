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
import {
  COR_EM_OPERACAO,
  COR_ENTREGUE,
  LEGENDA_OPERACAO,
  equipamentosPorSituacao,
  totaisOperacao,
} from "@/lib/painel-gestao-operacao";
import { PainelGestaoEquipamentos } from "@/components/features/painel-gestao-equipamentos";
import {
  PainelBloco,
  PainelNavegacao,
} from "@/components/features/painel-tecnico-estrutura";
import { PainelCartao } from "@/components/features/painel-gestao-cartao";
import {
  GraficoColunas,
  LegendaSegmentos,
} from "@/components/features/painel-gestao-colunas";
import { GraficoRosca } from "@/components/features/painel-gestao-rosca";
import { RankingBarras } from "@/components/features/painel-gestao-ranking";
import { PainelGestaoCompletude } from "@/components/features/painel-gestao-completude";
import {
  entregaInauguracaoPorAno,
  entregaPorUf,
  instrumentosParados,
  prazosMedios,
  situacaoInauguracao,
} from "@/lib/painel-gestao-andamento";
import { resumirCarteiraPainel } from "@/lib/monitoramento-painel-analise";
import {
  COR_PREVISTA,
  COR_REALIZADA,
  corDaContratacao,
  corDaFase,
} from "@/lib/monitoramento-painel-palette";

function formatarPrazo(dias: number): string {
  return dias >= 365
    ? `${(dias / 365).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`
    : `${dias.toLocaleString("pt-BR")} dias`;
}

const SECOES = [
  { id: "visao-geral", rotulo: "Visão geral" },
  { id: "evolucao", rotulo: "Evolução" },
  { id: "andamento", rotulo: "Andamento" },
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

  // O ano do instrumento é sempre o do instrumento firmado (convênio).
  // Instrumento de carga manual sem convênio correspondente usa o ano do próprio cadastro.
  const anoPorNumero = new Map(
    convenios.map((c) => [c.numero, c.anoInstrumento]),
  );
  const instrumentosFiltrados = filtros.filtrados.map((i) => ({
    ...i,
    ano_instrumento:
      anoPorNumero.get(i.nr_convenio) ?? i.ano_instrumento ?? null,
  }));
  const dados = montarMetricasPainel(instrumentosFiltrados, resumo, convenios);
  const fases = [...FASES_ACOMPANHAMENTO];
  const analise = resumirCarteiraPainel(instrumentosFiltrados, fases);
  const total = instrumentosFiltrados.length;
  const isAdmin = sessao.usuarioAtual?.role === "admin";
  const numeros = new Set(instrumentosFiltrados.map((i) => i.nr_convenio));
  const familias = equipamentosPorSituacao(
    resumo.equipamentos_por_instrumento,
    numeros,
    resumo.etapas_por_instrumento,
  );
  const entregaAno = entregaInauguracaoPorAno(
    numeros,
    resumo.etapas_por_instrumento,
  );
  const totalEntregaAno = entregaAno.anos.reduce(
    (t, a) => t + a.inaugurados + a.dispensados,
    0,
  );
  const persusIISemAno = filtros.hasFiltros
    ? 0
    : convenios.filter(
        (c) => c.tipoContratacao === "PERSUS II" && c.anoInstrumento == null,
      ).length;
  const situacaoInaug = situacaoInauguracao(
    numeros,
    resumo.etapas_por_instrumento,
    new Set(resumo.inauguracoes.map((i) => i.nr_convenio)),
  );
  const parados = instrumentosParados(
    instrumentosFiltrados,
    resumo.indicadores_por_instrumento.filter((i) =>
      numeros.has(i.nr_convenio),
    ),
  );
  const prazos = prazosMedios(numeros, resumo.etapas_por_instrumento);
  const porUf = entregaPorUf(
    instrumentosFiltrados,
    resumo.equipamentos_por_instrumento,
    resumo.etapas_por_instrumento,
  );
  const equipamentos = totaisOperacao(familias);
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
                key: "entregues",
                label: "Equipamentos entregues",
                value: equipamentos.entregue,
                detail: `${equipamentos.operacao} em operação · ${equipamentos.restante} planejados em ${familias.length} tipos`,
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
            <PainelGestaoEquipamentos familias={familias} />
          </div>
        </PainelBloco>

        <PainelBloco id="evolucao" titulo="Evolução">
          <PainelCartao titulo="Ano do instrumento">
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
            {persusIISemAno > 0 && (
              <p className="m-0 mt-4 text-xs text-muted-foreground">
                Não contabiliza os {persusIISemAno} PERSUS II, que não têm ano.
              </p>
            )}
          </PainelCartao>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PainelCartao
              titulo="Ano de Início de Operação dos Equipamentos"
              apoio={`${totalEntregaAno} equipamentos em operação`}
            >
              <LegendaSegmentos
                itens={[
                  { nome: "Inauguração realizada", cor: COR_REALIZADA },
                  {
                    nome: "Inauguração dispensada",
                    cor: "var(--painel-chart-turquesa)",
                  },
                ]}
              />
              <GraficoColunas
                vazio="Nenhum equipamento em operação neste recorte."
                colunas={entregaAno.anos.map((a) => ({
                  rotulo: a.ano,
                  segmentos: [
                    {
                      nome: "Inauguração realizada",
                      valor: a.inaugurados,
                      cor: COR_REALIZADA,
                    },
                    {
                      nome: "Inauguração dispensada",
                      valor: a.dispensados,
                      cor: "var(--painel-chart-turquesa)",
                    },
                  ],
                }))}
              />
              {entregaAno.aguardando > 0 && (
                <p className="m-0 mt-4 text-xs text-muted-foreground">
                  Não contabiliza {entregaAno.aguardando} equipamentos
                  entregues, que ainda precisam de inauguração.
                </p>
              )}
            </PainelCartao>
            <PainelCartao titulo="Situação da inauguração">
              <GraficoRosca
                rotuloTotal="instrumentos"
                fatias={[
                  {
                    rotulo: "Realizada",
                    valor: situacaoInaug.Realizada,
                    cor: COR_REALIZADA,
                  },
                  {
                    rotulo: "Prevista",
                    valor: situacaoInaug.Prevista,
                    cor: COR_PREVISTA,
                  },
                  {
                    rotulo: "Dispensada",
                    valor: situacaoInaug.Dispensada,
                    cor: "var(--painel-chart-turquesa)",
                  },
                  {
                    rotulo: "Sem registro",
                    valor: situacaoInaug["Sem registro"],
                    cor: "var(--painel-chart-ardosia)",
                  },
                ]}
              />
            </PainelCartao>
          </div>
        </PainelBloco>

        <PainelBloco id="andamento" titulo="Andamento">
          <div className="grid gap-6 lg:grid-cols-2">
            <PainelCartao
              titulo="Instrumentos parados"
              apoio={
                parados.semAtividade > 0
                  ? `${parados.semAtividade} sem nenhum lançamento`
                  : undefined
              }
            >
              <GraficoColunas
                vazio="Nenhum instrumento em andamento."
                colunas={parados.faixas.map((f) => ({
                  rotulo: f.rotulo,
                  segmentos: [
                    { nome: f.rotulo, valor: f.quantidade, cor: f.cor },
                  ],
                }))}
              />
            </PainelCartao>
            <PainelCartao titulo="Prazo médio entre etapas">
              <RankingBarras
                vazio="Sem instrumentos com as duas datas."
                itens={prazos.map((p) => ({
                  rotulo: `${p.rotulo} (${p.instrumentos})`,
                  valor: p.dias,
                  texto: formatarPrazo(p.dias),
                }))}
              />
            </PainelCartao>
          </div>
          <PainelCartao
            titulo="Entregue por UF"
            apoio={`${equipamentos.entregue} entregues · ${equipamentos.operacao} em operação · ${equipamentos.restante} planejados`}
          >
            <LegendaSegmentos itens={LEGENDA_OPERACAO} />
            <RankingBarras
              limite={10}
              vazio="Nenhum equipamento planejado neste recorte."
              itens={porUf.map((u) => ({
                rotulo: u.uf,
                valor: u.planejado,
                segmentos: [
                  { valor: u.operacao, cor: COR_EM_OPERACAO },
                  { valor: u.entregue, cor: COR_ENTREGUE },
                ],
                texto: `${u.operacao} · ${u.entregue} · ${u.planejado - u.operacao - u.entregue}`,
              }))}
            />
          </PainelCartao>
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
              titulo="Instrumentos por UF"
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
