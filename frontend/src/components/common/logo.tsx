import simbolo from "@/assets/brand/sisgeo-simbolo.svg";
import horizontal from "@/assets/brand/sisgeo-logo-horizontal.svg";
import marca from "@/assets/brand/sisgeo-marca.svg";
import negativo from "@/assets/brand/sisgeo-logo-negativo.svg";
import { cn } from "@/lib/utils";

type VarianteLogo = "completo" | "marca" | "reduzido" | "negativo";

const FONTES: Record<VarianteLogo, { src: string; proporcao: string }> = {
  completo: { src: horizontal, proporcao: "aspect-[629/184]" },
  marca: { src: marca, proporcao: "aspect-[629/138]" },
  negativo: { src: negativo, proporcao: "aspect-[629/184]" },
  reduzido: { src: simbolo, proporcao: "aspect-[52/76]" },
};

/** Logotipo do SISGEO. A altura vem do `className` (ex.: `h-9`); a largura
 * acompanha a proporção do arquivo. A variante `marca` traz só o nome e o
 * laço, sem a legenda: o cabeçalho a escreve como texto para ficar legível. */
export function Logo({
  variante = "completo",
  className,
}: {
  variante?: VarianteLogo;
  className?: string;
}) {
  const { src, proporcao } = FONTES[variante];
  return (
    <img
      src={src}
      alt={
        variante === "marca"
          ? "SISGEO"
          : "SISGEO – Gestão de Equipamentos em Oncologia"
      }
      className={cn("block w-auto select-none", proporcao, className)}
      draggable={false}
    />
  );
}
