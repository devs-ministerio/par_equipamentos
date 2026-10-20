import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { ClasseEquipamento } from "@/types/dados-oficiais";
import { chaveMunicipio } from "@/lib/municipio-filtro";

export const TAMANHO_PAGINA_DADOS_OFICIAIS = 20;

const PARAMETROS = [
  "busca",
  "uf",
  "municipio",
  "cnes",
  "equipamento",
  "classe",
  "situacao",
  "ano_inicio",
  "ano_fim",
  "programa",
  "tipo_contratacao",
] as const;

function paginaValida(valor: string | null): number {
  const pagina = Number(valor);
  return Number.isInteger(pagina) && pagina > 0 ? pagina : 1;
}

/** Estado da lista oficial refletido na URL.
 *
 * Assim o recorte sobrevive a recarga, favorito e ida/volta de uma página de
 * detalhe. Cada mudança de filtro remove `pagina`, pois a lista volta para a
 * primeira página por definição. */
export function useDadosOficiaisFiltros() {
  const [searchParams, setSearchParams] = useSearchParams();
  const busca = searchParams.get("busca") ?? "";
  const uf = searchParams.get("uf");
  const municipioNaUrl = searchParams.get("municipio");
  const municipio = municipioNaUrl
    ? chaveMunicipio(municipioNaUrl) || null
    : null;
  const cnes = searchParams.get("cnes");
  const equipamento = searchParams.get("equipamento");
  const classeEquipamento: ClasseEquipamento =
    searchParams.get("classe") === "outro" ? "outro" : "prioritario";
  const situacao = searchParams.get("situacao");
  const anoInicio = searchParams.get("ano_inicio");
  const anoFim = searchParams.get("ano_fim");
  const programa = searchParams.get("programa");
  const tipoContratacao = searchParams.get("tipo_contratacao");
  const pagina = paginaValida(searchParams.get("pagina"));

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

  return {
    busca,
    setBusca: (valor: string) => definirFiltro("busca", valor.trim() || null),
    uf,
    setUf: (valor: string | null) => definirFiltro("uf", valor),
    municipio,
    setMunicipio: (valor: string | null) => definirFiltro("municipio", valor),
    cnes,
    setCnes: (valor: string | null) => definirFiltro("cnes", valor),
    equipamento,
    setEquipamento: (valor: string | null) =>
      definirFiltro("equipamento", valor),
    classeEquipamento,
    setClasseEquipamento: (valor: ClasseEquipamento) =>
      definirFiltro("classe", valor === "prioritario" ? null : valor),
    situacao,
    setSituacao: (valor: string | null) => definirFiltro("situacao", valor),
    anoInicio,
    setAnoInicio: (valor: string | null) => definirFiltro("ano_inicio", valor),
    anoFim,
    setAnoFim: (valor: string | null) => definirFiltro("ano_fim", valor),
    programa,
    setPrograma: (valor: string | null) => definirFiltro("programa", valor),
    tipoContratacao,
    setTipoContratacao: (valor: string | null) =>
      definirFiltro("tipo_contratacao", valor),
    pagina,
    setPagina,
    pageSize: TAMANHO_PAGINA_DADOS_OFICIAIS,
    hasFiltros: PARAMETROS.some((parametro) => searchParams.has(parametro)),
    limparFiltros,
  };
}
