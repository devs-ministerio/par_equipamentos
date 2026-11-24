import { FASES_ACOMPANHAMENTO } from "@/lib/fases-acompanhamento";
import { useMemo, useState } from "react";
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
import { PainelGestaoFiltros } from "@/components/features/painel-gestao-filtros";
import { PainelGestaoRecortes } from "@/components/features/painel-gestao-recortes";
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
  ROTULO_SEM_LANCAMENTO,
  entregaInauguracaoPorAno,
  entregaPorUf,
  faixaDeAtualizacao,
  instrumentosDoPrazo,
  instrumentosParados,
  prazosMedios,
  situacaoDoInstrumento,
  situacaoInauguracao,
} from "@/lib/painel-gestao-andamento";
import type { ReferenciaPeriodo } from "@/lib/referencia-periodo-painel";
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

type FiltroLocal = "familia" | "inauguracao" | "atualizacao" | "prazo";

const ROTULO_FILTRO_LOCAL: Record<FiltroLocal, string> = {
  familia: "Família no gráfico",
  inauguracao: "Inauguração",
  atualizacao: "Sem atualizações",
  prazo: "Prazo entre etapas",
};

export function MonitoramentoPainelPage() {
  const [locais, setLocais] = useState<Partial<Record<FiltroLocal, string>>>(
    {},
  );
  const alternarLocal = (campo: FiltroLocal, valor: string) =>
    setLocais((atual) => {
      const proximo = { ...atual };
      if (atual[campo] === valor) delete proximo[campo];
      else proximo[campo] = valor;
      return proximo;
    });
  const resumoQuery = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const marcosQuery = useMonitoramentoMarcos();
  const conveniosQuery = useConveniosLista();
  const sessao = useAuthSession();
  const resumo = resumoQuery.data;
  const instrumentos = instrumentosQuery.data;
  const marcos = marcosQuery.data;
  const convenios = conveniosQuery.data?.itens;
  // O ano do firmado prevalece; cargas sem convênio usam o ano do cadastro.
  const instrumentosComAno = useMemo(() => {
    const anoPorNumero = new Map(
      convenios?.map((c) => [c.numero, c.anoInstrumento]),
    );
    return (instrumentos ?? []).map((i) => ({
      ...i,
      ano_instrumento:
        anoPorNumero.get(i.nr_convenio) ?? i.ano_instrumento ?? null,
    }));
  }, [instrumentos, convenios]);
  const filtros = useMonitoramentoInternoFiltros(
    instrumentosComAno,
    convenios ?? [],
    resumo?.inauguracoes ?? null,
    resumo?.etapas_por_instrumento ?? null,
  );
  const anoSelecionado = (referencia: ReferenciaPeriodo) =>
    filtros.referencia === referencia && filtros.anoInicio === filtros.anoFim
      ? filtros.anoInicio
      : null;
  const alternarAno = (referencia: ReferenciaPeriodo, ano: string) => {
    const valor = anoSelecionado(referencia) === ano ? null : ano;
    filtros.setPeriodo(valor, valor, valor ? referencia : "ano_instrumento");
  };
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

  const etapaPorNumero = new Map(
    resumo.etapas_por_instrumento.map((e) => [e.nr_convenio, e]),
  );
  const ultimaAtividade = new Map(
    resumo.indicadores_por_instrumento.map((i) => [
      i.nr_convenio,
      i.ultima_atividade_em,
    ]),
  );
  const comPrevisao = new Set(resumo.inauguracoes.map((i) => i.nr_convenio));
  const familiasDoNumero = new Map<string, Set<string>>();
  for (const l of resumo.equipamentos_por_instrumento) {
    const atual = familiasDoNumero.get(l.nr_convenio) ?? new Set<string>();
    atual.add(l.familia);
    familiasDoNumero.set(l.nr_convenio, atual);
  }
  const numerosDoPrazo = locais.prazo
    ? instrumentosDoPrazo(
        locais.prazo,
        new Set(filtros.filtrados.map((i) => i.nr_convenio)),
        resumo.etapas_por_instrumento,
      )
    : null;
  const instrumentosFiltrados = filtros.filtrados.filter((i) => {
    const n = i.nr_convenio;
    if (locais.familia && !familiasDoNumero.get(n)?.has(locais.familia))
      return false;
    if (
      locais.inauguracao &&
      situacaoDoInstrumento(etapaPorNumero.get(n), comPrevisao.has(n)) !==
        locais.inauguracao
    )
      return false;
    if (
      locais.atualizacao &&
      faixaDeAtualizacao(i.fase_atual, ultimaAtividade.get(n)) !==
        locais.atualizacao
    )
      return false;
    if (numerosDoPrazo && !numerosDoPrazo.has(n)) return false;
    return true;
  });
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
  return (
    <div className="space-y-6 pb-8">
      {header}
      <PainelNavegacao
        itens={SECOES}
        filtros={<PainelGestaoFiltros filtros={filtros} />}
      />
      <PainelGestaoRecortes
        filtros={filtros}
        recortesGraficos={(
          Object.entries(locais) as [FiltroLocal, string][]
        ).map(([campo, valor]) => ({
          rotulo: ROTULO_FILTRO_LOCAL[campo],
          valor,
          remover: () => alternarLocal(campo, valor),
        }))}
        limpar={() => {
          filtros.limparFiltros();
          setLocais({});
        }}
      />
      <div className="space-y-12">
        <PainelBloco id="visao-geral" titulo="Visão geral">
          <MetricStrip
            items={[
              {
                key: "instrumentos",
                label: "Instrumentos",
                value: total,
              },
              {
                key: "valor-global",
                label: "Valor global",
                value: dados.instrumentosComValor
                  ? fmtMoeda(dados.valorGlobal)
                  : "—",
              },
              {
                key: "operacao",
                label: "Equipamentos em operação",
                value: equipamentos.operacao,
                detail: `${equipamentos.entregue} entregues, a inaugurar · ${equipamentos.restante} planejados`,
              },
            ]}
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PainelCartao titulo="Instrumentos por situação">
              <GraficoColunas
                selecionado={filtros.situacao}
                onSelecionar={(r) =>
                  filtros.setSituacao(filtros.situacao === r ? null : r)
                }
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
            <PainelGestaoEquipamentos
              familias={familias}
              selecionada={locais.familia}
              onSelecionar={(f) => f && alternarLocal("familia", f)}
            />
          </div>
        </PainelBloco>

        <PainelBloco id="evolucao" titulo="Evolução">
          <PainelCartao titulo="Ano do instrumento">
            <GraficoColunas
              selecionado={anoSelecionado("ano_instrumento")}
              onSelecionar={(r) => alternarAno("ano_instrumento", r)}
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
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PainelCartao
              titulo="Ano de Início de Operação dos Equipamentos"
              apoio={`${totalEntregaAno} equipamentos em operação`}
            >
              <GraficoColunas
                selecionado={anoSelecionado("inicio_operacao")}
                onSelecionar={(r) => alternarAno("inicio_operacao", r)}
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
              <LegendaSegmentos
                itens={[
                  { nome: "Inauguração realizada", cor: COR_REALIZADA },
                  {
                    nome: "Inauguração dispensada",
                    cor: "var(--painel-chart-turquesa)",
                  },
                ]}
              />
            </PainelCartao>
            <PainelCartao titulo="Situação da inauguração">
              <GraficoRosca
                rotuloTotal="instrumentos"
                selecionada={locais.inauguracao}
                onSelecionar={(r) => alternarLocal("inauguracao", r)}
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
            <PainelCartao titulo="Instrumentos sem atualizações">
              <GraficoColunas
                vazio="Nenhum instrumento em andamento."
                selecionado={locais.atualizacao}
                onSelecionar={(r) => alternarLocal("atualizacao", r)}
                colunas={[
                  ...parados.faixas.map((f) => ({
                    rotulo: f.rotulo,
                    segmentos: [
                      { nome: f.rotulo, valor: f.quantidade, cor: f.cor },
                    ],
                  })),
                  {
                    rotulo: ROTULO_SEM_LANCAMENTO,
                    segmentos: [
                      {
                        nome: ROTULO_SEM_LANCAMENTO,
                        valor: parados.semAtividade,
                        cor: "var(--painel-chart-ardosia)",
                      },
                    ],
                  },
                ]}
              />
            </PainelCartao>
            <PainelCartao titulo="Prazo médio entre etapas">
              <RankingBarras
                compacto
                vazio="Sem instrumentos com as duas datas."
                selecionado={locais.prazo}
                onSelecionar={(r) => alternarLocal("prazo", r)}
                itens={prazos.map((p) => ({
                  chave: p.rotulo,
                  rotulo: `${p.rotulo} (${p.instrumentos})`,
                  valor: p.dias,
                  texto: formatarPrazo(p.dias),
                }))}
              />
            </PainelCartao>
          </div>
          <PainelCartao titulo="Entregue por UF">
            <RankingBarras
              limite={10}
              selecionado={filtros.uf}
              onSelecionar={(uf) =>
                filtros.setUfComMunicipio(filtros.uf === uf ? null : uf)
              }
              vazio="Nenhum equipamento planejado neste recorte."
              itens={porUf.map((u) => ({
                rotulo: u.uf,
                valor: u.planejado,
                segmentos: [
                  { valor: u.operacao, cor: COR_EM_OPERACAO },
                  { valor: u.entregue, cor: COR_ENTREGUE },
                ],
                texto: `${u.operacao} de ${u.planejado}`,
              }))}
            />
            <LegendaSegmentos
              itens={LEGENDA_OPERACAO.map((l, i) => ({
                ...l,
                valor: [
                  equipamentos.operacao,
                  equipamentos.entregue,
                  equipamentos.restante,
                ][i],
              }))}
            />
          </PainelCartao>
        </PainelBloco>

        <PainelBloco id="composicao" titulo="Composição">
          <div className="grid gap-6 lg:grid-cols-2">
            <PainelCartao titulo="Tipo de contratação">
              <GraficoRosca
                fatias={contratacoes}
                rotuloTotal="instrumentos"
                selecionada={filtros.tipoContratacao}
                onSelecionar={(r) =>
                  filtros.setTipoContratacao(
                    filtros.tipoContratacao === r ? null : r,
                  )
                }
              />
            </PainelCartao>
            <PainelCartao titulo="Investimento por contratação">
              <RankingBarras
                selecionado={filtros.tipoContratacao}
                onSelecionar={(r) =>
                  filtros.setTipoContratacao(
                    filtros.tipoContratacao === r ? null : r,
                  )
                }
                itens={dados.porTipo.map((t) => ({
                  rotulo: t.rotulo,
                  detalhe: `${t.comValor} de ${t.quantidade} com valor`,
                  valor: t.valor,
                  cor: corDaContratacao(t.rotulo),
                  texto: t.comValor ? fmtMoeda(t.valor) : "—",
                }))}
              />
            </PainelCartao>
            <PainelCartao titulo="Valor global por situação">
              <RankingBarras
                limite={8}
                selecionado={filtros.situacao}
                onSelecionar={(r) =>
                  filtros.setSituacao(filtros.situacao === r ? null : r)
                }
                itens={fases
                  .map((f) => ({
                    rotulo: f,
                    valor: dados.valoresPorFase.get(f) ?? 0,
                  }))
                  .filter((f) => f.valor > 0)
                  .map((f) => ({
                    ...f,
                    cor: corDaFase(f.rotulo, fases),
                    texto: fmtMoeda(f.valor),
                  }))}
              />
            </PainelCartao>
            <PainelCartao
              titulo="Instrumentos por UF"
              apoio={`Top 5 concentram ${analise.concentracaoTop5Uf}%`}
              className="lg:row-span-2"
            >
              <RankingBarras
                limite={14}
                selecionado={filtros.uf}
                onSelecionar={(uf) =>
                  filtros.setUfComMunicipio(filtros.uf === uf ? null : uf)
                }
                itens={analise.ufs.map((u) => ({
                  rotulo: u.rotulo,
                  valor: u.quantidade,
                }))}
              />
            </PainelCartao>
            <PainelCartao titulo="Instrumentos por técnico titular">
              <RankingBarras
                limite={8}
                selecionado={filtros.responsavel}
                onSelecionar={(r) =>
                  filtros.setResponsavel(filtros.responsavel === r ? null : r)
                }
                itens={dados.porTecnico.map((t) => ({
                  chave:
                    t.rotulo === "Não informado" ? "Sem responsável" : t.rotulo,
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
