import type { StatusCobertura } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  selecionados: Set<StatusCobertura>;
  onChange: (proximo: Set<StatusCobertura>) => void;
}

/**
 * Substitui a busca por texto nas tabelas de Cobertura Assistencial (pedido
 * explicito) -- dois botoes clicaveis (toggle) que filtram a lista por
 * status. Nenhum selecionado = mostra tudo; um ou os dois selecionados =
 * so as linhas daquele(s) status. Hipossuficiente primeiro (vermelho antes
 * do verde, mesma ordem ja adotada nas legendas).
 */
export function StatusFilterButtons({ selecionados, onChange }: Props) {
  function toggle(status: StatusCobertura) {
    const proximo = new Set(selecionados);
    if (proximo.has(status)) proximo.delete(status);
    else proximo.add(status);
    onChange(proximo);
  }

  const hipoAtivo = selecionados.has("Hipossuficiente");
  const hiperAtivo = selecionados.has("Hiperssuficiente");

  return (
    <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap">
      <Button
        variant="outline"
        onClick={() => toggle("Hipossuficiente")}
        className={cn(
          "min-h-11 min-w-0 rounded-full px-1.5 py-1.5 text-[11px] font-semibold sm:h-auto sm:min-h-0 sm:px-3 sm:text-xs",
          hipoAtivo &&
            "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20",
        )}
      >
        Hipossuficiente
      </Button>
      <Button
        variant="outline"
        onClick={() => toggle("Hiperssuficiente")}
        className={cn(
          "min-h-11 min-w-0 rounded-full px-1.5 py-1.5 text-[11px] font-semibold sm:h-auto sm:min-h-0 sm:px-3 sm:text-xs",
          hiperAtivo &&
            "border-success bg-success/10 text-success hover:bg-success/20",
        )}
      >
        Hiperssuficiente
      </Button>
    </div>
  );
}
