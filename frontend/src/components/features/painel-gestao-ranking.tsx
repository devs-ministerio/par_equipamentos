import { cn } from "@/lib/utils";

export interface ItemRanking {
  rotulo: string;
  valor: number;
  /** Valor enviado a `onSelecionar` (padrão: o rótulo). */
  chave?: string;
  /** Texto à direita; padrão é o próprio valor. */
  texto?: string;
  /** Linha de apoio sob o rótulo, em tom discreto. */
  detalhe?: string;
  /** Cor própria da barra (padrão: gradiente primário). */
  cor?: string;
  /** Partes coloridas da barra, em ordem; o que sobra do valor fica no tom claro. */
  segmentos?: Array<{ valor: number; cor: string }>;
}

interface PropsLinha {
  item: ItemRanking;
  maximo: number;
  compacto: boolean;
  selecionado?: string | null;
  onSelecionar?: (chave: string) => void;
}

function Linha({
  item,
  maximo,
  compacto,
  selecionado,
  onSelecionar,
}: PropsLinha) {
  const chave = item.chave ?? item.rotulo;
  const Tag = onSelecionar ? "button" : "div";
  return (
    <Tag
      {...(onSelecionar
        ? {
            type: "button" as const,
            "aria-pressed": selecionado === chave,
            onClick: () => onSelecionar(chave),
          }
        : {})}
      className={cn(
        "grid w-full items-center rounded-md border-0 bg-transparent p-1 text-left text-inherit",
        compacto
          ? "grid-cols-[minmax(0,1fr)_minmax(1.25rem,16%)_auto] gap-1.5 text-xs sm:grid-cols-[minmax(0,12rem)_minmax(1.25rem,1fr)_auto] sm:gap-3 sm:text-sm"
          : "grid-cols-[minmax(0,9rem)_1fr_auto] gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_1fr_auto]",
        onSelecionar &&
          "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
        selecionado === chave && "bg-primary/10",
        selecionado && selecionado !== chave && "opacity-40",
      )}
    >
      <span
        className={cn("leading-tight", compacto && "truncate")}
        title={item.rotulo}
      >
        {item.rotulo}
        {item.detalhe && (
          <small className="block text-xs font-normal text-muted-foreground">
            {item.detalhe}
          </small>
        )}
      </span>
      <div
        className={cn(
          "overflow-hidden rounded-full bg-secondary",
          compacto ? "h-2.25" : "h-2.5",
        )}
        aria-hidden="true"
      >
        <div
          className={
            item.cor
              ? "h-full rounded-full"
              : !item.segmentos
                ? "h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                : "h-full rounded-full bg-primary/25"
          }
          style={{
            width: `${(100 * item.valor) / maximo}%`,
            ...(item.cor ? { backgroundColor: item.cor } : {}),
          }}
        >
          {item.segmentos && (
            <div className="flex h-full">
              {item.segmentos.map((seg, i) => (
                <div
                  key={i}
                  className="h-full"
                  style={{
                    width: `${item.valor > 0 ? (100 * seg.valor) / item.valor : 0}%`,
                    backgroundColor: seg.cor,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <strong className="min-w-8 text-right font-semibold tabular-nums">
        {item.texto ?? item.valor}
      </strong>
    </Tag>
  );
}

/** Barras horizontais ordenadas; acima de `limite` linhas a lista rola dentro do cartão. */
export function RankingBarras({
  itens,
  limite = 7,
  compacto = false,
  vazio = "Nenhum instrumento neste recorte.",
  selecionado,
  onSelecionar,
}: {
  itens: ItemRanking[];
  limite?: number;
  compacto?: boolean;
  vazio?: string;
  /** Chave da linha filtrada; as demais ficam esmaecidas. */
  selecionado?: string | null;
  /** Com esta prop, cada linha vira um botão que filtra o painel. */
  onSelecionar?: (chave: string) => void;
}) {
  if (itens.length === 0)
    return <p className="m-0 text-sm text-muted-foreground">{vazio}</p>;
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  const altura = itens.some((i) => i.detalhe) ? 3.5 : 2.75;
  const rola = itens.length > limite;
  return (
    <ul
      className={
        rola
          ? "m-0 list-none space-y-2 overflow-y-auto p-0 pr-2"
          : "m-0 flex flex-1 list-none flex-col justify-evenly gap-2 p-0"
      }
      style={rola ? { maxHeight: `${limite * altura}rem` } : undefined}
      tabIndex={rola ? 0 : undefined}
      aria-label={rola ? "Lista com rolagem" : undefined}
    >
      {itens.map((item) => (
        <li key={item.rotulo}>
          <Linha
            item={item}
            maximo={maximo}
            compacto={compacto}
            selecionado={selecionado}
            onSelecionar={onSelecionar}
          />
        </li>
      ))}
    </ul>
  );
}
