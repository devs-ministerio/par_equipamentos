import { cn } from "@/lib/utils";
import { iniciaisDoNome } from "@/lib/iniciais";

/** "Foto" do usuário: círculo com as iniciais do nome ("IGOR PEREIRA LINS"
 * → "IL"). Decorativo (`aria-hidden`) -- quem o envolve (botão do menu)
 * carrega o nome completo no rótulo acessível. */
export function AvatarIniciais({
  nome,
  tamanho = "md",
  className,
}: {
  nome: string | null | undefined;
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="avatar-iniciais"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary font-display font-bold tracking-wide text-primary-foreground",
        tamanho === "sm" && "size-7 text-[11px]",
        tamanho === "md" && "size-8 text-xs",
        tamanho === "lg" && "size-11 text-sm",
        className,
      )}
    >
      {iniciaisDoNome(nome)}
    </span>
  );
}
