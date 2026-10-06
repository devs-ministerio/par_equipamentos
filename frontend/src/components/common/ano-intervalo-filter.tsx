import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SingleSelectFilter,
  type SingleSelectOption,
} from "./single-select-filter";

export function AnoIntervaloFilter({
  options,
  inicio,
  fim,
  onInicioChange,
  onFimChange,
}: {
  options: SingleSelectOption[];
  inicio: string | null;
  fim: string | null;
  onInicioChange: (value: string | null) => void;
  onFimChange: (value: string | null) => void;
}) {
  const rotulo = inicio || fim ? `${inicio ?? "…"} — ${fim ?? "…"}` : "Período";
  const atualizarInicio = (value: string | null) => {
    onInicioChange(value);
    if (value && fim && Number(value) > Number(fim)) onFimChange(null);
  };
  const atualizarFim = (value: string | null) => {
    onFimChange(value);
    if (value && inicio && Number(value) < Number(inicio)) onInicioChange(null);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between sm:w-auto sm:min-w-[150px]"
        >
          <span className="inline-flex items-center gap-2">
            <CalendarRange aria-hidden="true" size={15} />
            {rotulo}
          </span>
          <span aria-hidden="true">▾</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[2000] w-[min(320px,calc(100vw-2rem))] space-y-3"
      >
        <p className="text-xs font-semibold text-muted-foreground">Período</p>
        <SingleSelectFilter
          placeholder="Ano início"
          options={options}
          value={inicio}
          onChange={atualizarInicio}
          clearLabel="Ano início"
          minWidth={220}
        />
        <SingleSelectFilter
          placeholder="Ano fim"
          options={options}
          value={fim}
          onChange={atualizarFim}
          clearLabel="Ano fim"
          minWidth={220}
        />
      </PopoverContent>
    </Popover>
  );
}
