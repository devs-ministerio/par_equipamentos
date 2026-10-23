/** Fila de revisão da classificação dos itens do plano (gestor e administrador). */
import { ErrorAlert } from "@/components/common/error-alert";
import { PageHeader } from "@/components/common/page-header";
import { ClassificacaoItemCard } from "@/components/features/classificacao-item-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDecidirItem,
  useFilaClassificacao,
} from "@/hooks/useClassificacaoItens";
import { mensagemSeguraDoErro } from "@/lib/api-error";

export function ClassificacaoItensPage() {
  const fila = useFilaClassificacao(true);
  const decidir = useDecidirItem();

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow="Gestão"
        title="Revisão de itens"
        description="Itens do plano que a regra não classificou com segurança."
      />
      {fila.error ? (
        <ErrorAlert
          mensagem={mensagemSeguraDoErro(fila.error)}
          onRetry={() => fila.refetch()}
        />
      ) : !fila.data ? (
        <Skeleton
          className="h-40 w-full"
          role="status"
          aria-label="Carregando"
        />
      ) : fila.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum item a revisar.</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {fila.data.map((item) => (
            <ClassificacaoItemCard
              key={item.id}
              item={item}
              onDecidir={(corpo) =>
                decidir
                  .mutateAsync({ itemId: item.id, corpo })
                  .then(() => undefined)
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
