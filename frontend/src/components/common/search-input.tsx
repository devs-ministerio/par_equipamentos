import type { CSSProperties } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Default 240 -- so uma pagina com mais filtro ao lado (ex.
   * MonitoramentoEquipamentosPage.tsx, 6 SingleSelectFilter) precisa de um
   * valor menor pra tudo caber na mesma linha. */
  width?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  width = 240,
}: Props) {
  return (
    <Input
      type="text"
      aria-label={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-11 min-w-0 w-full rounded-md border-[1.5px] border-border bg-card px-3.5 py-1.5 text-[12.5px] leading-[1.428571] font-medium placeholder:text-muted-foreground sm:h-auto sm:min-h-0 sm:w-[var(--search-width)] sm:max-w-full md:text-[12.5px] md:leading-[1.428571]"
      style={{ "--search-width": `${width / 16}rem` } as CSSProperties}
    />
  );
}
