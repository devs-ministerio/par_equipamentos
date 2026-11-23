import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import { MetricStrip } from "@/components/common/metric-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { CardColaborador } from "@/components/features/card-colaborador";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  useCarteiraTecnico,
  usePainelTecnico,
  useTecnicosPainel,
} from "@/hooks/use-painel-tecnico";
import {
  SecaoAtividade,
  SecaoRegistro,
} from "@/components/features/painel-tecnico-secoes";
import { PainelTecnicoCarteira } from "@/components/features/painel-tecnico-carteira";
import {
  entrouNoRadarRecente,
  type FiltroCarteira,
} from "@/lib/painel-tecnico-filtro";
import { fmtData } from "@/lib/monitoramento-format";

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
  const ultimoRadar = linhas
    .map((l) => l.entrou_radar_em)
    .filter((d): d is string => d != null)
    .sort()
    .at(-1);
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
            label: "Cobertura da região",
            value:
              c.cobertura_pct == null
                ? "—"
                : `${c.cobertura_pct.toLocaleString("pt-BR")}%`,
            variant: "primary",
            detail: `${c.monitorados} de ${c.elegiveis} convênios`,
            onClick: () => setFiltroCarteira("todos"),
            ativo: filtroCarteira === "todos",
          },
          {
            key: "faltam",
            label: "Faltam incluir",
            value: faltam.length,
            variant: faltam.length > 0 ? "warning" : "success",
            detail: `${faltamAbertos} em aberto`,
            onClick: () => alternar("faltam"),
            ativo: filtroCarteira === "faltam",
          },
          {
            key: "sem-titular",
            label: "Sem titular",
            value: linhas.filter((l) => l.monitorado && !l.titular).length,
            detail: "Sem técnico designado",
            onClick: () => alternar("sem-titular"),
            ativo: filtroCarteira === "sem-titular",
          },
          {
            key: "concluidos",
            label: "Concluídos",
            value: concluidos,
            variant: "success",
            detail: "No monitoramento interno",
            onClick: () => alternar("concluidos"),
            ativo: filtroCarteira === "concluidos",
          },
          {
            key: "radar",
            label: "Novos Instrumentos",
            value: novosRadar,
            detail: ultimoRadar
              ? `Último em ${fmtData(ultimoRadar)}`
              : "Nenhum até agora",
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
      <SecaoRegistro dados={dados} />
      <SecaoAtividade dados={dados} />
    </div>
  );
}
