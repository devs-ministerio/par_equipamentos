import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MonitoramentoFilaAcoes } from "@/components/features/monitoramento-fila-acoes";
import { MonitoramentoPainelPrazos } from "@/components/features/monitoramento-painel-prazos";
import type { montarMetricasPainel } from "@/lib/monitoramento-painel-metricas";

interface FonteComErro {
  refetch: () => Promise<unknown>;
}

/** Prazos e pendências do técnico; mostra erro ou carregamento enquanto faltam fontes. */
export function PainelTecnicoPrazos({
  prazos,
  fontesComErro,
  pendentes,
  filaTruncada,
}: {
  prazos: ReturnType<typeof montarMetricasPainel> | null;
  fontesComErro: FonteComErro[];
  pendentes: number;
  filaTruncada: boolean;
}) {
  return (
    <>
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
            filaTruncada={filaTruncada}
          />
        </div>
      ) : fontesComErro.length > 0 ? (
        <ErrorAlert
          mensagem="Não foi possível carregar prazos e pendências."
          onRetry={() =>
            Promise.all(fontesComErro.map((query) => query.refetch()))
          }
        />
      ) : (
        <div className="grid gap-3" role="status" aria-label="Carregando">
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      )}
    </>
  );
}
