import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFontes } from "@/hooks/use-fontes";
import { mensagemSeguraDoErro } from "@/lib/api-error";

const STATUS = { ok: "Concluída", parcial: "Parcial", erro: "Falhou" } as const;
const dataHora = (valor: string | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR") : "Nenhum sucesso registrado";

/** Monitor da descoberta, não da verificação de convênios já na carteira. */
export function MonitorDescobertaLegado({
  fonte: codigo,
}: {
  fonte: "siconv_descoberta" | "transferegov_descoberta";
}) {
  const consulta = useFontes();
  const fonte = consulta.data?.find((item) => item.fonte === codigo);
  return (
    <section
      aria-label="Monitor de consultas"
      className="my-4 border-l-2 border-primary bg-muted/40 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold">
          Última consulta ·{" "}
          {codigo === "siconv_descoberta" ? "SICONV / Portal" : "TransfereGov"}
        </h3>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={consulta.isFetching}
          aria-label="Atualizar histórico de consultas"
          title="Atualiza o histórico; não executa coleta"
          onClick={() => void consulta.refetch()}
        >
          <RefreshCw
            className={`size-3.5 ${consulta.isFetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>
      {consulta.isPending ? (
        <Skeleton className="mt-2 h-10 w-full" />
      ) : consulta.error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {mensagemSeguraDoErro(consulta.error)}
        </p>
      ) : !fonte ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Nenhuma coleta registrada.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span
              className={
                fonte.status === "ok" && !fonte.defasada
                  ? "font-medium text-primary"
                  : "font-medium text-destructive"
              }
            >
              {STATUS[fonte.status]}
              {fonte.defasada ? " · Defasada" : ""}
            </span>
            <span>{dataHora(fonte.ultima_tentativa_em)}</span>
            <span className="text-muted-foreground">
              {fonte.itens_verificados} verificados · {fonte.itens_alterados}{" "}
              alterados
            </span>
          </div>
          <details className="mt-2 text-xs">
            <summary className="w-fit cursor-pointer text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Detalhes da coleta
            </summary>
            <p className="mt-2">
              Último sucesso: {dataHora(fonte.ultimo_sucesso_em)}
            </p>
            {fonte.erro && (
              <p className="mt-1 text-muted-foreground">{fonte.erro}</p>
            )}
          </details>
        </>
      )}
    </section>
  );
}
