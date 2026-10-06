import { useId } from "react";

interface Props<T extends string> {
  value: T;
  direction: "asc" | "desc";
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  onToggleDirection: () => void;
}

export function MobileTableSort<T extends string>({
  value,
  direction,
  options,
  onChange,
  onToggleDirection,
}: Props<T>) {
  const selectId = useId();
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2 sm:hidden">
      <label
        htmlFor={selectId}
        className="shrink-0 text-xs text-muted-foreground"
      >
        Ordenar por
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm text-foreground"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onToggleDirection}
        aria-label={
          direction === "asc"
            ? "Ordenação crescente; inverter"
            : "Ordenação decrescente; inverter"
        }
        title={direction === "asc" ? "Crescente" : "Decrescente"}
        className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-lg"
      >
        {direction === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
