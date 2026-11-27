import { useState } from "react";
import type { FiltroCarteira } from "@/lib/painel-tecnico-filtro";

/** Filtros do Meu painel: o da carteira e os escolhidos nos gráficos. */
export function useFiltrosMeuPainel() {
  const [filtroCarteira, setFiltroCarteira] = useState<FiltroCarteira>("todos");
  const [faseSel, setFaseSel] = useState<string | undefined>();
  const [familiaSel, setFamiliaSel] = useState<string | undefined>();
  const limparFiltros = () => {
    setFiltroCarteira("todos");
    setFaseSel(undefined);
    setFamiliaSel(undefined);
  };
  const irParaCarteira = () =>
    requestAnimationFrame(() =>
      document
        .getElementById("carteira")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  const alternar = (f: FiltroCarteira) => {
    setFiltroCarteira((atual) => (atual === f ? "todos" : f));
    if (filtroCarteira !== f) irParaCarteira();
  };
  const chips = [
    ...(faseSel
      ? [{ rotulo: faseSel, onRemover: () => setFaseSel(undefined) }]
      : []),
    ...(familiaSel
      ? [{ rotulo: familiaSel, onRemover: () => setFamiliaSel(undefined) }]
      : []),
  ];
  return {
    filtroCarteira,
    setFiltroCarteira,
    faseSel,
    setFaseSel,
    familiaSel,
    setFamiliaSel,
    limparFiltros,
    irParaCarteira,
    alternar,
    chips,
  };
}
