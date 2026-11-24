import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { chaveMunicipio } from "@/lib/municipio-filtro";
import {
  PARAMETROS,
  type InstrumentoMonitoramentoFiltravel,
} from "@/lib/monitoramento-filtros-instrumento";
import type { ReferenciaPeriodo } from "@/lib/referencia-periodo-painel";

/** Escritores dos filtros na URL (sempre `replace`, sempre voltando à página 1). */
export function useAcoesFiltrosUrl(
  instrumentos: InstrumentoMonitoramentoFiltravel[],
) {
  const [, setSearchParams] = useSearchParams();
  const definirFiltro = useCallback(
    (chave: (typeof PARAMETROS)[number], valor: string | null) => {
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (valor) proximos.set(chave, valor);
          else proximos.delete(chave);
          proximos.delete("pagina");
          if (chave === "classe") proximos.delete("equipamento");
          return proximos;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPagina = useCallback(
    (proximaPagina: number) => {
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          if (proximaPagina <= 1) proximos.delete("pagina");
          else proximos.set("pagina", String(proximaPagina));
          return proximos;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const limparFiltros = useCallback(() => {
    setSearchParams(
      (anteriores) => {
        const proximos = new URLSearchParams(anteriores);
        for (const parametro of PARAMETROS) proximos.delete(parametro);
        proximos.delete("pagina");
        return proximos;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const setUfComMunicipio = (valor: string | null) => {
    setSearchParams(
      (anteriores) => {
        const proximos = new URLSearchParams(anteriores);
        if (valor) proximos.set("uf", valor);
        else proximos.delete("uf");
        const municipioAtual = proximos.get("municipio");
        if (
          valor &&
          municipioAtual &&
          !instrumentos.some(
            (item) =>
              item.uf === valor &&
              chaveMunicipio(item.municipio ?? "") ===
                chaveMunicipio(municipioAtual),
          )
        ) {
          proximos.delete("municipio");
        }
        proximos.delete("pagina");
        return proximos;
      },
      { replace: true },
    );
  };
  const setReferencia = (valor: string | null) => {
    setSearchParams(
      (anteriores) => {
        const proximos = new URLSearchParams(anteriores);
        if (valor) proximos.set("referencia", valor);
        else proximos.delete("referencia");
        proximos.delete("ano_inicio");
        proximos.delete("ano_fim");
        proximos.delete("pagina");
        return proximos;
      },
      { replace: true },
    );
  };
  const setPeriodo = (
    inicio: string | null,
    fim: string | null,
    novaReferencia?: ReferenciaPeriodo,
  ) => {
    // useSearchParams não enfileira dois setters como useState.
    setSearchParams(
      (anteriores) => {
        const proximos = new URLSearchParams(anteriores);
        if (inicio) proximos.set("ano_inicio", inicio);
        else proximos.delete("ano_inicio");
        if (fim) proximos.set("ano_fim", fim);
        else proximos.delete("ano_fim");
        if (novaReferencia === "ano_instrumento") proximos.delete("referencia");
        else if (novaReferencia) proximos.set("referencia", novaReferencia);
        proximos.delete("pagina");
        return proximos;
      },
      { replace: true },
    );
  };
  return {
    definirFiltro,
    setPagina,
    limparFiltros,
    setUfComMunicipio,
    setReferencia,
    setPeriodo,
  };
}
