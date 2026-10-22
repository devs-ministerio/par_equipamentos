import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFontes } from "@/hooks/use-fontes";
import { mensagemSeguraDoErro } from "@/lib/api-error";

function dataHora(valor: string | null) {
  return valor
    ? new Date(valor).toLocaleString("pt-BR")
    : "Nenhuma coleta concluída";
}

const ROTULOS_STATUS = {
  ok: "Coleta concluída",
  parcial: "Resposta parcial",
  erro: "Falha na coleta",
} as const;

/** A defasagem é definida no backend; a UI não presume atualização por visita. */
export function SituacaoFontes() {
  const fontes = useFontes();
  return (
    <details className="my-4 border-l-2 border-primary bg-muted/40 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        Atualização das fontes oficiais
      </summary>
      {fontes.isPending ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : fontes.error ? (
        <div role="alert" className="mt-3 space-y-2 text-sm">
          <p>{mensagemSeguraDoErro(fontes.error)}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fontes.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : fontes.data?.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma coleta registrada.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {fontes.data?.map((fonte) => (
            <li
              key={fonte.fonte}
              className="min-w-0 space-y-2 py-3 text-xs [overflow-wrap:anywhere]"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-sm font-semibold">{fonte.rotulo}</h3>
                <span
                  className={
                    fonte.status === "ok" ? "text-primary" : "text-destructive"
                  }
                >
                  {ROTULOS_STATUS[fonte.status]}
                </span>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Última tentativa</dt>
                  <dd>{dataHora(fonte.ultima_tentativa_em)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Última coleta concluída
                  </dt>
                  <dd>{dataHora(fonte.ultimo_sucesso_em)}</dd>
                </div>
              </dl>
              <p className="text-muted-foreground">
                Última rodada: {fonte.itens_verificados} verificados ·{" "}
                {fonte.itens_alterados} alterados
              </p>
              {fonte.defasada && (
                <p className="font-medium text-destructive">
                  {fonte.ultimo_sucesso_em
                    ? "Dados defasados: mais de 36 horas sem coleta concluída."
                    : "Sem coleta concluída: frescor não confirmado."}
                </p>
              )}
              {fonte.erro && <p>{fonte.erro}</p>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
