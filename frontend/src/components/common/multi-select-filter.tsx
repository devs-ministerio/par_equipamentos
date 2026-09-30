import { useEffect, useId, useRef, useState } from "react";
import { normalizarTexto } from "@/utils/texto";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  placeholder: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  appearance?: "default" | "standard";
}

/** Não é exclusivo do dashboard -- também usado pelos modais de exportação
 * de RelatoriosPage.tsx (ExportPdfModal/ExportXlsxModal). Fica em
 * components/common/ por isso, apesar de morar em components/dashboard/
 * historicamente (ver CLAUDE.md, seção "Estrutura de pastas do frontend"). */
export function MultiSelectFilter({
  placeholder,
  options,
  selected,
  onChange,
  appearance = "default",
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = options.filter((o) =>
    normalizarTexto(o.label).includes(normalizarTexto(search)),
  );
  const active = selected.length > 0 || open;
  const label =
    selected.length === 0 ? placeholder : `${selected.length} selecionado(s)`;

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "relative min-w-0 w-full sm:w-auto",
        appearance === "standard" && "sm:max-w-80",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" && !open) setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={cn(
          appearance === "standard"
            ? "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border-[1.5px] px-3.5 py-1.5 text-left text-[12.5px] font-medium sm:min-h-0"
            : "w-full rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-medium sm:w-auto",
          active
            ? "border-primary text-primary"
            : appearance === "standard"
              ? "border-border text-foreground"
              : "border-border text-muted-foreground",
          selected.length > 0
            ? "bg-secondary"
            : open
              ? "bg-accent/60"
              : appearance === "standard"
                ? "bg-card"
                : "bg-muted",
        )}
      >
        {appearance === "standard" ? (
          <>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {label}
            </span>
            <span className="shrink-0">▾</span>
          </>
        ) : (
          <>{label} ▾</>
        )}
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full left-0 mt-1 w-full min-w-0 rounded-lg border border-border bg-card py-2 shadow-lg",
            appearance === "standard"
              ? "z-[2000] sm:min-w-[260px]"
              : "z-[100] sm:min-w-[220px]",
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <div
            className={cn(
              "border-b px-2.5 py-1.5",
              appearance === "standard" ? "border-border" : "border-muted",
            )}
          >
            <input
              ref={inputRef}
              type="text"
              aria-label={`Pesquisar em ${placeholder}`}
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="box-border w-full rounded-md border border-border px-2 py-1.5 text-xs outline-none"
            />
          </div>
          <div
            id={listboxId}
            role="group"
            aria-label={placeholder}
            className="max-h-55 overflow-y-auto"
          >
            {filtered.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-foreground cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-[15px] w-[15px] cursor-pointer accent-primary"
                />
                {opt.label}
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">
                Nenhum resultado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
