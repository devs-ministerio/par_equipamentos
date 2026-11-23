import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import { MetricStrip } from "@/components/common/metric-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  usePainelTecnico,
  useTecnicosPainel,
} from "@/hooks/use-painel-tecnico";
import {
  SecaoAtividade,
  SecaoCarteira,
  SecaoRegistro,
  SecaoSemRegistro,
} from "@/components/features/painel-tecnico-secoes";

export function MonitoramentoMeuPainelPage() {
  const { usuarioAtual } = useAuthSession();
  const gestao =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const [colaboradorId, setColaboradorId] = useState<number | undefined>();
  const tecnicos = useTecnicosPainel(gestao);
  const consulta = usePainelTecnico(colaboradorId);
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
      actions={filtro}
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
  return (
    <div className="space-y-6">
      {header}
      <p className="m-0 text-sm text-muted-foreground">
        {dados.escopo === "todos"
          ? "Todos os estados"
          : `${dados.usuario?.nome} · ${(dados.ufs ?? []).join(", ") || "sem região definida"}`}
      </p>
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
          },
          {
            key: "faltam",
            label: "Faltam incluir (em aberto)",
            value: c.faltam_em_aberto,
            variant: c.faltam_em_aberto > 0 ? "warning" : "success",
          },
          {
            key: "sem-registro",
            label: "Sem registro",
            value: dados.meus.sem_registro,
          },
          {
            key: "atrasadas",
            label: "Ações atrasadas",
            value: dados.acoes.atrasadas,
            variant: dados.acoes.atrasadas > 0 ? "destructive" : "success",
          },
          {
            key: "lanc",
            label: "Lançamentos em 14 dias",
            value: dados.atividade.lancamentos_14d,
          },
        ]}
      />
      <SecaoCarteira dados={dados} />
      <SecaoRegistro dados={dados} />
      <SecaoAtividade dados={dados} />
      <SecaoSemRegistro dados={dados} />
    </div>
  );
}
