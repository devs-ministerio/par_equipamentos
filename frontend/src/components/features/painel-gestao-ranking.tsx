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
  /** Parte do valor já realizada (ex.: entregue de planejado), desenhada dentro da barra. */
  parcial?: number;
  /** Partes coloridas da barra, em ordem; o que sobra do valor fica no tom claro. */
  segmentos?: Array<{ valor: number; cor: string }>;
}

interface PropsLinha {
  item: ItemRanking;
  maximo: number;
  selecionado?: string | null;
  onSelecionar?: (chave: string) => void;
}

function Linha({ item, maximo, selecionado, onSelecionar }: PropsLinha) {
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
        "grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md border-0 bg-transparent p-1 text-left text-sm text-inherit sm:grid-cols-[minmax(0,11rem)_1fr_auto]",
        onSelecionar &&
          "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
        selecionado === chave && "bg-primary/10",
        selecionado && selecionado !== chave && "opacity-40",
      )}
    >
      <span className="leading-tight" title={item.rotulo}>
        {item.rotulo}
        {item.detalhe && (
          <small className="block text-xs font-normal text-muted-foreground">
            {item.detalhe}
          </small>
        )}
      </span>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-secondary"
        aria-hidden="true"
      >
        <div
          className={
            item.cor
              ? "h-full rounded-full"
              : item.parcial === undefined && !item.segmentos
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
          {item.parcial !== undefined && (
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
              style={{
                width: `${item.valor > 0 ? (100 * item.parcial) / item.valor : 0}%`,
              }}
            />
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
  vazio = "Nenhum instrumento neste recorte.",
  selecionado,
  onSelecionar,
}: {
  itens: ItemRanking[];
  limite?: number;
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
            selecionado={selecionado}
            onSelecionar={onSelecionar}
          />
        </li>
      ))}
    </ul>
  );
}
