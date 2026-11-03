import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { normalizarTexto } from "@/utils/texto";
import { cn } from "@/lib/utils";

export interface SingleSelectOption {
  value: string;
  label: string;
  /** Título do grupo; opções seguidas com o mesmo grupo aparecem sob um único cabeçalho. */
  group?: string;
}

interface SingleSelectFilterProps {
  placeholder: string;
  options: SingleSelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Rotulo da linha "limpar selecao" no topo da lista -- omitir esconde a linha (selecao sempre obrigatoria). */
  clearLabel?: string;
  minWidth?: number;
}

/**
 * Combobox de selecao unica com busca -- mesmo visual/padrao do
 * MultiSelectFilter (usado nos filtros do Dashboard), mas pra escolher UM
 * item so (fecha e substitui ao clicar, sem checkbox) -- caso do seletor de
 * Macro/Municipio no recorte do Mapa, onde so um valor guia o que e buscado
 * (2026-08-23: antes era um <select> nativo, ruim de usar com 121 macros ou
 * 5.570 municipios pra rolar).
 *
 * Cross mapa+monitoramento (não exclusivo do mapa) -- fica em
 * components/common/ por isso, mesmo raciocínio já usado pro
 * MultiSelectFilter (ver CLAUDE.md, seção "Estrutura de pastas do
 * frontend").
 */
export function SingleSelectFilter({
  placeholder,
  options,
  value,
  onChange,
  clearLabel,
  minWidth = 260,
}: SingleSelectFilterProps) {
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
  const selecionado = options.find((o) => o.value === value);
  // Filtro ativo sem opção correspondente (a cascata a removeu): continua
  // visível, para o usuário saber que ele ainda restringe a consulta.
  const semCorrespondencia = !!value && !selecionado;
  const rotulo = semCorrespondencia
    ? `${value} (sem correspondência)`
    : (selecionado?.label ?? placeholder);

  function escolher(v: string | null) {
    onChange(v);
    setOpen(false);
  }

  function fechar() {
    setOpen(false);
  }

  return (
    <div
      ref={ref}
      className="relative min-w-0 w-full sm:w-auto sm:max-w-[var(--filter-max-width)]"
      style={
        {
          "--filter-max-width": `${Math.max(minWidth, 320)}px`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Escape") fechar();
          if (event.key === "ArrowDown" && !open) setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border-[1.5px] px-3.5 py-1.5 text-left text-[12.5px] font-medium sm:min-h-0",
          value || open
            ? "border-primary text-primary"
            : "border-border text-foreground",
          value ? "bg-secondary" : open ? "bg-accent/60" : "bg-card",
        )}
      >
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {rotulo}
        </span>
        <span className="shrink-0">▾</span>
      </button>
      {open && (
        <div
          // Leaflet usa z-index ate ~1000 nos proprios controles/panes
          // (ver .leaflet-top/.leaflet-control no leaflet.css) -- o mapa
          // logo abaixo desse seletor tampava o painel de busca com
          // z-index baixo. 1000 nao bastava dependendo do zoom/tile pane;
          // usa uma margem folgada.
          className="absolute top-full left-0 z-[2000] mt-1 w-full min-w-0 rounded-lg border border-border bg-card py-2 shadow-lg sm:min-w-[260px]"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              fechar();
            }
          }}
        >
          <div className="border-b border-border px-2.5 py-1.5">
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
            role="listbox"
            className="max-h-65 overflow-y-auto"
          >
            {clearLabel && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => escolher(null)}
                className={cn(
                  "block w-full cursor-pointer border-b border-border px-3 py-1.5 text-left text-[13px]",
                  value
                    ? "font-normal text-muted-foreground"
                    : "font-semibold text-primary",
                )}
              >
                {clearLabel}
              </button>
            )}
            {filtered.map((opt, indice) => (
              <Fragment key={opt.value}>
                {opt.group && opt.group !== filtered[indice - 1]?.group && (
                  <div
                    role="presentation"
                    className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase"
                  >
                    {opt.group}
                  </div>
                )}
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => escolher(opt.value)}
                className={cn(
                  "block w-full cursor-pointer px-3 py-1.5 text-left text-[13px]",
                  opt.value === value
                    ? "bg-secondary font-semibold text-primary"
                    : "font-normal text-foreground",
                )}
              >
                {opt.label}
              </button>
              </Fragment>
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
