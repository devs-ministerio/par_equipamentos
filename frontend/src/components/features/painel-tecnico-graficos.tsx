import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PainelGestaoEquipamentos } from "@/components/features/painel-gestao-equipamentos";
import { SecaoSituacao } from "@/components/features/painel-tecnico-situacao";
import { equipamentosPorSituacao } from "@/lib/painel-gestao-operacao";
import type { LinhaCarteira } from "@/services/painel-tecnico";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ResumoMonitoramento } from "@/services/monitoramento-resumo";

/** Gráficos do Meu painel: instrumentos por situação e equipamentos por família. */
export function PainelTecnicoGraficos({
  linhasSituacao,
  faseSel,
  onFase,
  familiaSel,
  onFamilia,
  resumo,
  numerosEquipamentos,
}: {
  linhasSituacao: LinhaCarteira[];
  faseSel: string | undefined;
  onFase: (fase: string | undefined) => void;
  familiaSel: string | undefined;
  onFamilia: (familia: string | undefined) => void;
  resumo: UseQueryResult<ResumoMonitoramento>;
  numerosEquipamentos: Set<string>;
}) {
  const equipamentosResumo = resumo.data?.equipamentos_por_instrumento ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <SecaoSituacao
        linhas={linhasSituacao}
        selecionada={faseSel}
        onSelecionar={onFase}
      />
      {resumo.data ? (
        <PainelGestaoEquipamentos
          familias={equipamentosPorSituacao(
            equipamentosResumo,
            numerosEquipamentos,
            resumo.data.etapas_por_instrumento,
          )}
          selecionada={familiaSel}
          onSelecionar={onFamilia}
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
  );
}
