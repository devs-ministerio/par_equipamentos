import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import { MetricStrip } from "@/components/common/metric-strip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PainelBloco,
  PainelNavegacao,
} from "@/components/features/painel-tecnico-estrutura";
import { CardColaborador } from "@/components/features/card-colaborador";
import { PainelGestaoEquipamentos } from "@/components/features/painel-gestao-equipamentos";
import { equipamentosPorSituacao } from "@/lib/painel-gestao-operacao";
import { SecaoSituacao } from "@/components/features/painel-tecnico-situacao";
import { MonitoramentoFilaAcoes } from "@/components/features/monitoramento-fila-acoes";
import { MonitoramentoPainelPrazos } from "@/components/features/monitoramento-painel-prazos";
import { montarMetricasPainel } from "@/lib/monitoramento-painel-metricas";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useMonitoramentoResumo } from "@/hooks/useMonitoramentoResumo";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  useCarteiraTecnico,
  usePainelTecnico,
  useTecnicosPainel,
} from "@/hooks/use-painel-tecnico";
import { PainelTecnicoCarteira } from "@/components/features/painel-tecnico-carteira";
import {
  entrouNoRadarRecente,
  JANELA_RADAR_DIAS,
  faseDaLinha,
  type FiltroCarteira,
} from "@/lib/painel-tecnico-filtro";
import { fmtMoeda } from "@/lib/monitoramento-format";

const SECOES = [
  { id: "visao-geral", rotulo: "Visão geral" },
  { id: "carteira", rotulo: "Carteira" },
  { id: "prazos", rotulo: "Prazos e pendências" },
];

export function MonitoramentoMeuPainelPage() {
  const { usuarioAtual } = useAuthSession();
  const gestao =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const [colaboradorId, setColaboradorId] = useState<number | undefined>();
  const tecnicos = useTecnicosPainel(gestao);
  const consulta = usePainelTecnico(colaboradorId);
  const carteiraQuery = useCarteiraTecnico(colaboradorId);
  const [filtroCarteira, setFiltroCarteira] = useState<FiltroCarteira>("todos");
  const [faseSel, setFaseSel] = useState<string | undefined>();
  const [familiaSel, setFamiliaSel] = useState<string | undefined>();
  const linhas = carteiraQuery.data;
  const dados = consulta.data;
  const limparFiltros = () => {
    setFiltroCarteira("todos");
    setFaseSel(undefined);
    setFamiliaSel(undefined);
  };
  const resumo = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const conveniosQuery = useConveniosLista();

  const titulo = gestao ? "Painéis da equipe" : "Meu painel";
  const filtro = gestao ? (
    <label className="flex w-full flex-col gap-1 text-sm sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <span className="text-muted-foreground">Colaborador</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
        value={colaboradorId ?? ""}
        onChange={(e) => {
          setColaboradorId(e.target.value ? Number(e.target.value) : undefined);
          limparFiltros();
        }}
      >
        <option value="">Todos</option>
        {(tecnicos.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
            {t.ufs.length > 0 ? ` (${t.ufs.join(", ")})` : ""}
          </option>
        ))}
      </select>
    </label>
  ) : undefined;
  const header = (
    <PageHeader
      eyebrow="Monitoramento interno"
      title={titulo}
      actions={
        <div className="flex w-full flex-wrap items-stretch gap-3 sm:w-auto">
          <CardColaborador semBotao />
          {filtro}
        </div>
      }
    />
  );

  if (consulta.isError) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar o painel."
          onRetry={() => consulta.refetch()}
        />
      </div>
    );
  }
  if (carteiraQuery.isError && !linhas) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar a carteira."
          onRetry={() => carteiraQuery.refetch()}
        />
      </div>
    );
  }
  if (!dados || !linhas) {
    return (
      <div>
        {header}
        <div
          className="grid gap-3"
          role="status"
          aria-label="Carregando painel"
        >
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  const semRegiao =
    dados.escopo === "individual" && (dados.ufs ?? []).length === 0;
  const c = dados.carteira;
  const faltam = linhas.filter((l) => !l.monitorado);
  const faltamAbertos = faltam.filter((l) => l.em_aberto).length;
  const concluidos = linhas.filter(
    (l) => l.monitorado && l.fase === "Concluído",
  ).length;
  const novosRadar = linhas.filter(entrouNoRadarRecente);
  const valorRadar = novosRadar.reduce((t, l) => t + (l.valor_global ?? 0), 0);
  const pendentes = linhas.reduce((t, l) => t + l.acoes_abertas, 0);
  const numerosMonitorados = new Set(
    linhas.filter((l) => l.monitorado).map((l) => l.numero),
  );
  const equipamentosResumo = resumo.data?.equipamentos_por_instrumento ?? [];
  const numerosDaFamilia = (familia: string) =>
    new Set(
      equipamentosResumo
        .filter((e) => e.familia === familia && e.planejado > 0)
        .map((e) => e.nr_convenio),
    );
  const numerosFamiliaSel = familiaSel ? numerosDaFamilia(familiaSel) : null;
  const linhasSituacao = numerosFamiliaSel
    ? linhas.filter((l) => l.monitorado && numerosFamiliaSel.has(l.numero))
    : linhas;
  const linhasDaFase = faseSel
    ? linhas.filter((l) => faseDaLinha(l) === faseSel)
    : linhas;
  const numerosEquipamentos = new Set(
    linhasDaFase.filter((l) => l.monitorado).map((l) => l.numero),
  );
  const linhasCarteira = linhasDaFase.filter(
    (l) => !numerosFamiliaSel || numerosFamiliaSel.has(l.numero),
  );
  const chipsDashboard = [
    ...(faseSel
      ? [{ rotulo: faseSel, onRemover: () => setFaseSel(undefined) }]
      : []),
    ...(familiaSel
      ? [{ rotulo: familiaSel, onRemover: () => setFamiliaSel(undefined) }]
      : []),
  ];
  const prazos =
    resumo.data && instrumentosQuery.data && conveniosQuery.data
      ? montarMetricasPainel(
          instrumentosQuery.data.filter((i) =>
            numerosMonitorados.has(i.nr_convenio),
          ),
          resumo.data,
          conveniosQuery.data.itens,
        )
      : null;
  const fontesPrazosComErro = [
    resumo,
    instrumentosQuery,
    conveniosQuery,
  ].filter((query) => query.isError);
  const atrasadas = linhas.reduce((t, l) => t + l.acoes_atrasadas, 0);
  const irParaCarteira = () =>
    requestAnimationFrame(() =>
      document
        .getElementById("carteira")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  const alternar = (f: FiltroCarteira) => {
    setFiltroCarteira((atual) => (atual === f ? "todos" : f));
    if (filtroCarteira !== f) irParaCarteira();
  };
  return (
    <div className="space-y-6 pb-8">
      {header}
      {tecnicos.isError && (
        <ErrorAlert
          mensagem="Não foi possível carregar a lista de colaboradores."
          onRetry={() => tecnicos.refetch()}
        />
      )}
      {semRegiao && (
        <ErrorAlert mensagem="Este colaborador ainda não tem região de monitoramento definida." />
      )}
      <PainelNavegacao itens={SECOES} />
      <div className="space-y-12">
        <PainelBloco id="visao-geral" titulo="Visão geral">
          <MetricStrip
            items={[
              {
                key: "cobertura",
                label: "Cobertura do monitoramento",
                value:
                  c.cobertura_pct == null
                    ? "—"
                    : `${c.cobertura_pct.toLocaleString("pt-BR")}%`,
                variant: "primary",
                detail: `${c.monitorados} de ${c.elegiveis} instrumentos monitorados`,
                onClick: () => {
                  limparFiltros();
                  irParaCarteira();
                },
                ativo: filtroCarteira === "todos" && !faseSel && !familiaSel,
              },
              {
                key: "faltam",
                label: "Fora do monitoramento",
                value: faltam.length,
                variant: faltam.length > 0 ? "warning" : "success",
                detail: `${faltamAbertos} em aberto`,
                onClick: () => alternar("faltam"),
                ativo: filtroCarteira === "faltam",
              },
              {
                key: "acoes-pendentes",
                label: "Ações pendentes",
                value: pendentes,
                variant: atrasadas > 0 ? "destructive" : "success",
                detail: `${atrasadas} atrasadas`,
                onClick: () => alternar("acoes-pendentes"),
                ativo: filtroCarteira === "acoes-pendentes",
              },
              {
                key: "concluidos",
                label: "Concluídos",
                value: concluidos,
                variant: "success",
                onClick: () => alternar("concluidos"),
                ativo: filtroCarteira === "concluidos",
              },
              {
                key: "radar",
                label: "Novos Instrumentos",
                value: novosRadar.length,
                detail: `${fmtMoeda(valorRadar)} nos últimos ${JANELA_RADAR_DIAS} dias`,
                onClick: () => alternar("radar"),
                ativo: filtroCarteira === "radar",
              },
            ]}
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <SecaoSituacao
              linhas={linhasSituacao}
              selecionada={faseSel}
              onSelecionar={setFaseSel}
            />
            {resumo.data ? (
              <PainelGestaoEquipamentos
                familias={equipamentosPorSituacao(
                  equipamentosResumo,
                  numerosEquipamentos,
                  resumo.data.etapas_por_instrumento,
                )}
                selecionada={familiaSel}
                onSelecionar={setFamiliaSel}
              />
            ) : resumo.isError ? (
              <ErrorAlert
                mensagem="Não foi possível carregar os equipamentos."
                onRetry={() => resumo.refetch()}
              />
            ) : (
              <div role="status" aria-label="Carregando equipamentos">
                <Skeleton className="h-full min-h-64" />
              </div>
            )}
          </div>
        </PainelBloco>
        <PainelBloco id="carteira" titulo="Carteira">
          <PainelTecnicoCarteira
            linhas={linhasCarteira}
            total={linhas.length}
            chips={chipsDashboard}
            filtro={filtroCarteira}
            onLimpar={() => setFiltroCarteira("todos")}
          />
        </PainelBloco>
        <PainelBloco id="prazos" titulo="Prazos e pendências">
          {prazos ? (
            <div className="space-y-6">
              <MonitoramentoPainelPrazos
                vigencias={prazos.vigenciasProximas}
                licencas={prazos.licencas}
                inauguracoes={prazos.inauguracoes}
                divergencias={prazos.divergencias}
              />
              <MonitoramentoFilaAcoes
                acoes={prazos.acoes}
                acoesPendentes={pendentes}
                filaTruncada={resumo.data?.fila_acoes_truncada ?? false}
              />
            </div>
          ) : fontesPrazosComErro.length > 0 ? (
            <ErrorAlert
              mensagem="Não foi possível carregar prazos e pendências."
              onRetry={() =>
                Promise.all(fontesPrazosComErro.map((query) => query.refetch()))
              }
            />
          ) : (
            <div className="grid gap-3" role="status" aria-label="Carregando">
              <Skeleton className="h-20" />
              <Skeleton className="h-64" />
            </div>
          )}
        </PainelBloco>
      </div>
    </div>
  );
}
