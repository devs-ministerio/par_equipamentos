import { cn } from "@/lib/utils";
import {
  COR_EM_OPERACAO,
  COR_ENTREGUE,
  COR_PLANEJADO,
  LEGENDA_OPERACAO,
  totaisOperacao,
  type FamiliaOperacao,
} from "@/lib/painel-gestao-operacao";
import { LegendaSegmentos } from "@/components/features/painel-gestao-colunas";

const LIMITE = 8;

/** Equipamentos por tipo: em operação, entregues (precisam de inauguração) e o restante planejado. */
export function PainelGestaoEquipamentos({
  familias: todas,
  selecionada,
  onSelecionar,
}: {
  familias: FamiliaOperacao[];
  /** Com `onSelecionar`, cada tipo vira um botão que filtra o restante da página. */
  selecionada?: string;
  onSelecionar?: (familia: string | undefined) => void;
}) {
  const familias = todas
    .filter((f) => f.planejado > 0)
    .sort(
      (a, b) =>
        b.operacao + b.entregue - (a.operacao + a.entregue) ||
        b.planejado - a.planejado ||
        a.familia.localeCompare(b.familia),
    );
  const { operacao, entregue, restante } = totaisOperacao(familias);
  const maximo = Math.max(1, ...familias.map((f) => f.planejado));
  const rola = familias.length > LIMITE;
  return (
    <section className="flex h-full min-w-0 flex-col rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <h3 className="m-0 text-base font-semibold tracking-tight">
        Equipamentos por tipo
      </h3>
      {familias.length === 0 ? (
        <p className="mt-4 mb-0 text-sm text-muted-foreground">
          Nenhum equipamento com controle por unidade nos instrumentos
          monitorados.
        </p>
      ) : (
        <>
          <ul
            className={cn(
              "m-0 mt-5 list-none space-y-3 p-0",
              rola && "overflow-y-auto pr-2",
            )}
            style={rola ? { maxHeight: `${LIMITE * 2.9}rem` } : undefined}
            tabIndex={rola ? 0 : undefined}
            aria-label={rola ? "Lista com rolagem" : undefined}
          >
            {familias.map((f) => (
              <li key={f.familia}>
                <button
                  type="button"
                  disabled={!onSelecionar}
                  aria-pressed={selecionada === f.familia}
                  onClick={() =>
                    onSelecionar?.(
                      selecionada === f.familia ? undefined : f.familia,
                    )
                  }
                  title={`${f.familia}: ${f.operacao} em operação, ${f.entregue} entregues a inaugurar, ${f.planejado - f.operacao - f.entregue} planejados`}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[minmax(0,7rem)_minmax(2rem,1fr)_4.5rem] items-center gap-2 rounded-md border-0 bg-transparent p-1 text-left text-sm text-inherit transition-colors enabled:hover:bg-muted/50 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-ring xl:grid-cols-[minmax(0,11rem)_1fr_4.5rem] xl:gap-3",
                    selecionada === f.familia && "bg-primary/10",
                    selecionada && selecionada !== f.familia && "opacity-40",
                  )}
                >
                  <span className="leading-tight">{f.familia}</span>
                  <div
                    className="h-3 overflow-hidden rounded-full bg-secondary"
                    aria-hidden="true"
                  >
                    <div
                      className="flex h-full overflow-hidden rounded-full"
                      style={{
                        width: `${(100 * f.planejado) / maximo}%`,
                        backgroundColor: COR_PLANEJADO,
                      }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${(100 * f.operacao) / f.planejado}%`,
                          backgroundColor: COR_EM_OPERACAO,
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${(100 * f.entregue) / f.planejado}%`,
                          backgroundColor: COR_ENTREGUE,
                        }}
                      />
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                      {f.operacao}
                    </strong>{" "}
                    de {f.planejado}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {familias.length > 0 && (
        <LegendaSegmentos
          itens={LEGENDA_OPERACAO.map((l, i) => ({
            ...l,
            valor: [operacao, entregue, restante][i],
          }))}
        />
      )}
    </section>
  );
}
