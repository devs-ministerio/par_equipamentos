import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import { MetricStrip } from "@/components/common/metric-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { CardColaborador } from "@/components/features/card-colaborador";
import { SecaoEquipamentos } from "@/components/features/painel-tecnico-equipamentos";
import { entreguesPorFamilia } from "@/lib/equipamentos-entregues";
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
  type FiltroCarteira,
} from "@/lib/painel-tecnico-filtro";
import { fmtMoeda } from "@/lib/monitoramento-format";

export function MonitoramentoMeuPainelPage() {
  const { usuarioAtual } = useAuthSession();
  const gestao =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const [colaboradorId, setColaboradorId] = useState<number | undefined>();
  const tecnicos = useTecnicosPainel(gestao);
  const consulta = usePainelTecnico(colaboradorId);
  const carteiraQuery = useCarteiraTecnico(colaboradorId);
  const [filtroCarteira, setFiltroCarteira] = useState<FiltroCarteira>("todos");
  const linhas = carteiraQuery.data ?? [];
  const dados = consulta.data;
  const resumo = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const conveniosQuery = useConveniosLista();

  const titulo = gestao ? "Painéis da equipe" : "Meu painel";
  const filtro = gestao ? (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Colaborador</span>
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={colaboradorId ?? ""}
        onChange={(e) =>
          setColaboradorId(e.target.value ? Number(e.target.value) : undefined)
        }
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
        <div className="flex flex-wrap items-stretch gap-3">
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
  if (!dados) {
    return (
      <div>
        {header}
        <Skeleton className="h-24 w-full" />
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
  const novosRadar = linhas.filter(entrouNoRadarRecente).length;
  const valorRadar = linhas
    .filter(entrouNoRadarRecente)
    .reduce((t, l) => t + (l.valor_global ?? 0), 0);
  const pendentes = linhas.reduce((t, l) => t + l.acoes_abertas, 0);
  const numerosMonitorados = new Set(
    linhas.filter((l) => l.monitorado).map((l) => l.numero),
  );
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
  const atrasadas = linhas.reduce((t, l) => t + l.acoes_atrasadas, 0);
  const alternar = (f: FiltroCarteira) =>
    setFiltroCarteira((atual) => (atual === f ? "todos" : f));
  return (
    <div className="space-y-6">
      {header}
      {semRegiao && (
        <ErrorAlert mensagem="Este colaborador ainda não tem região de monitoramento definida." />
      )}
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
            onClick: () => setFiltroCarteira("todos"),
            ativo: filtroCarteira === "todos",
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
            value: novosRadar,
            detail: `${fmtMoeda(valorRadar)} nos últimos ${JANELA_RADAR_DIAS} dias`,
            onClick: () => alternar("radar"),
            ativo: filtroCarteira === "radar",
          },
        ]}
      />
      {carteiraQuery.isError ? (
        <ErrorAlert
          mensagem="Não foi possível carregar a carteira."
          onRetry={() => carteiraQuery.refetch()}
        />
      ) : (
        <PainelTecnicoCarteira
          linhas={linhas}
          filtro={filtroCarteira}
          onLimpar={() => setFiltroCarteira("todos")}
        />
      )}
      {prazos && (
        <>
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
            className="mt-8"
          />
        </>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <SecaoSituacao linhas={linhas} />
        <SecaoEquipamentos
          familias={entreguesPorFamilia(
            resumo.data?.equipamentos_por_instrumento ?? [],
            numerosMonitorados,
          )}
        />
      </div>
    </div>
  );
}
