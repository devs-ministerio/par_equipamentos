import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MacroRankItem } from "@/hooks/usePainelGeralResumos";

/**
 * Ranking (leaderboard) das 5 macros mais Hipo ou mais Hiper, com toggle
 * entre as duas visoes (2026-08-22). A barra NAO usa uma escala fixa
 * compartilhada entre os dois modos -- hipo vai de 0 a 100% (por definicao,
 * abaixo da meta), hiper passa de 500% em alguns casos (ex.: Centro-Norte/GO
 * a 570%). Numa escala unica os dois extremos ficariam ilegiveis (hipo
 * viraria barrinhas minusculas). Em vez disso cada visao escala em relacao
 * ao PROPRIO maior valor exibido (o #1 sempre enche a linha inteira) --
 * padrao comum de leaderboard, mostra ranking relativo, nao magnitude
 * absoluta entre os dois modos.
 *
 * Bug real corrigido 2026-08-22: no modo Hipo a barra usava a cobertura em
 * si (`item.cobertura / maior`) -- como o pior caso (#1) e o de MENOR
 * cobertura, ele tinha a barra mais CURTA da lista (ex.: OESTE-AM #1 a 17%
 * com barra minuscula, NORDESTE #5 a 89% quase cheia), o oposto do que
 * "barra mais longa" deveria comunicar num ranking de piores casos. Agora o
 * modo Hipo escala pela GRAVIDADE (100 - cobertura, "quao longe da meta"),
 * entao o #1 sempre fica com a barra mais cheia, do jeito que o olho espera.
 * O modo Hiper nao tinha esse problema (maior cobertura = mais barra = mais
 * folga, direcao ja intuitiva) e continua igual.
 */
export function PainelGeralRankingMacros({
  hipo,
  hiper,
}: {
  hipo: MacroRankItem[];
  hiper: MacroRankItem[];
}) {
  const [modo, setModo] = useState<"hipo" | "hiper">("hipo");
  const itens = modo === "hipo" ? hipo : hiper;
  const corTexto = modo === "hipo" ? "text-destructive" : "text-success";
  const corBarra = modo === "hipo" ? "bg-destructive" : "bg-success";
  const valorBarra = (item: MacroRankItem) =>
    modo === "hipo" ? Math.max(0, 100 - item.cobertura) : item.cobertura;
  // Hipo usa escala ABSOLUTA (0-100, o proprio valor de severidade vira a
  // largura direto) -- diferente do Hiper, que so faz sentido relativo ao
  // maior dos 5 exibidos (bug real corrigido 2026-08-22: OESTE a 17% tinha
  // severidade 83%, mas a barra aparecia 100% cheia porque escalava em
  // relacao a si mesmo, sendo o #1; 83% de severidade agora rende
  // literalmente 83% de barra). Hiper continua relativo porque nao tem teto
  // natural (chega a 570%) -- uma escala absoluta ali faria a maioria das
  // barras saturar no maximo e perder a diferenca entre os 5.
  const maiorValor =
    modo === "hipo" ? 100 : Math.max(...itens.map(valorBarra), 1);

  if (hipo.length === 0 && hiper.length === 0) return null;

  return (
    <div>
      <div className="mb-2.5 flex gap-1.5">
        <button
          onClick={() => setModo("hipo")}
          disabled={hipo.length === 0}
          className={cn(
            "rounded-full border-[1.5px] bg-card px-[11px] py-1 text-[11px] font-bold",
            hipo.length === 0 ? "cursor-default opacity-50" : "cursor-pointer",
            modo === "hipo"
              ? "border-destructive bg-destructive-bg text-destructive"
              : "border-border",
            modo !== "hipo" &&
              (hipo.length === 0
                ? "text-muted-foreground/70"
                : "text-muted-foreground"),
          )}
        >
          ▾ 5 mais Hipo
        </button>
        <button
          onClick={() => setModo("hiper")}
          disabled={hiper.length === 0}
          className={cn(
            "rounded-full border-[1.5px] bg-card px-[11px] py-1 text-[11px] font-bold",
            hiper.length === 0 ? "cursor-default opacity-50" : "cursor-pointer",
            modo === "hiper"
              ? "border-success bg-success-bg text-success"
              : "border-border",
            modo !== "hiper" &&
              (hiper.length === 0
                ? "text-muted-foreground/70"
                : "text-muted-foreground"),
          )}
        >
          ▴ 5 mais Hiper
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {itens.map((item, i) => (
          <div key={item.macroId} className="flex items-center gap-2">
            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#f4f6fb] text-[9.5px] font-bold text-muted-foreground/70">
              {i + 1}
            </span>
            <span
              className="w-[178px] flex-shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-muted-foreground"
              title={`${item.nome} (${item.uf})`}
            >
              {item.nome} ({item.uf})
            </span>
            <div className="h-1.5 flex-1 overflow-clip rounded-[3px] bg-[#eef0f4]">
              <div
                className={cn("h-full", corBarra)}
                style={{ width: `${(valorBarra(item) / maiorValor) * 100}%` }}
              />
            </div>
            <span
              className={cn(
                "w-9 flex-shrink-0 whitespace-nowrap text-right text-[11.5px] font-bold",
                corTexto,
              )}
            >
              {item.cobertura.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
