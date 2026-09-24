import { useEffect, useRef, useState } from "react";
import { useFamiliaEquipamento } from "../../hooks/use-familia-equipamento";
import { EQUIPAMENTOS } from "../../data/constants";

/** Seletor de familia de equipamento -- troca a familia lida por
 * Dashboard/Mapa/Relatorios inteiras (via FamiliaEquipamentoContext).
 * TOMOGRAFO e RESSONANCIA tem pipeline/dado real hoje; as demais aparecem
 * desabilitadas pra deixar claro que o escopo maior do projeto ja esta
 * desenhado, sem virar link morto.
 *
 * Vive sozinho neste arquivo (nome do arquivo mantido por historico) desde
 * 2026-09-11 -- a barra de navegação em si (Dashboard/Mapa/Relatórios)
 * virou o header unificado `AppHeader.tsx`, usado em `AppLayout.tsx` com
 * este componente como `leftExtra`. */
export function SeletorEquipamento() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { familia, setFamilia } = useFamiliaEquipamento();
  const atual =
    EQUIPAMENTOS.find((eq) => eq.familia === familia) ?? EQUIPAMENTOS[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 cursor-pointer rounded-[6px] border border-border bg-white px-3 text-[13px] font-semibold text-foreground"
      >
        {atual.rotulo} ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 min-w-[200px] rounded-[6px] border border-border bg-white py-1 shadow-[var(--shadow-overlay)]">
          {EQUIPAMENTOS.map((eq) => (
            <div
              key={eq.familia}
              title={eq.disponivel ? undefined : "Em breve"}
              className={`flex w-full items-center border-none px-3.5 py-2 text-left text-[13px] ${
                eq.familia === atual.familia ? "bg-secondary" : "bg-transparent"
              } ${
                eq.disponivel
                  ? eq.familia === atual.familia
                    ? "cursor-pointer font-semibold text-primary"
                    : "cursor-pointer font-normal text-[#475066]"
                  : "cursor-not-allowed font-normal text-muted-foreground/70"
              }`}
              onClick={() => {
                if (!eq.disponivel) return;
                setFamilia(eq.familia);
                setOpen(false);
              }}
            >
              {eq.rotulo}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
