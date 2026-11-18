import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  ClasseEquipamento,
  FiltroMonitorado,
} from "@/types/dados-oficiais";
import { chaveMunicipio } from "@/lib/municipio-filtro";

export const TAMANHO_PAGINA_DADOS_OFICIAIS = 20;

/** Filtros que aceitam mais de uma opção (parâmetro repetido na URL: `uf=SP&uf=RJ`). */
const MULTIPLOS = [
  "uf",
  "municipio",
  "cnes",
  "equipamento",
  "situacao",
  "programa",
  "tipo_contratacao",
] as const;

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
  "monitorado",
] as const;

/** Lista estável: só troca de identidade quando o conteúdo muda (evita refazer memos a cada render). */
function useListaEstavel(valores: string[]): string[] {
  const anterior = useRef<string[]>(valores);
  const igual =
    anterior.current.length === valores.length &&
    anterior.current.every((v, i) => v === valores[i]);
  if (!igual) anterior.current = valores;
  return anterior.current;
}

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
  const uf = useListaEstavel(searchParams.getAll("uf"));
  const municipio = useListaEstavel(
    searchParams
      .getAll("municipio")
      .map((nome) => chaveMunicipio(nome))
      .filter(Boolean),
  );
  const cnes = useListaEstavel(searchParams.getAll("cnes"));
  const equipamento = useListaEstavel(searchParams.getAll("equipamento"));
  const classeEquipamento: ClasseEquipamento =
    searchParams.get("classe") === "outro" ? "outro" : "prioritario";
  const situacao = useListaEstavel(searchParams.getAll("situacao"));
  const anoInicio = searchParams.get("ano_inicio");
  const anoFim = searchParams.get("ano_fim");
  const programa = useListaEstavel(searchParams.getAll("programa"));
  const tipoContratacao = useListaEstavel(
    searchParams.getAll("tipo_contratacao"),
  );
  const monitoradoNaUrl = searchParams.get("monitorado");
  const monitorado: FiltroMonitorado | null =
    monitoradoNaUrl === "sim" || monitoradoNaUrl === "nao"
      ? monitoradoNaUrl
      : null;
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

  const definirLista = useCallback(
    (chave: (typeof MULTIPLOS)[number], valores: string[]) => {
      setSearchParams(
        (anteriores) => {
          const proximos = new URLSearchParams(anteriores);
          proximos.delete(chave);
          for (const valor of new Set(valores)) proximos.append(chave, valor);
          proximos.delete("pagina");
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
    setUf: (valores: string[]) => definirLista("uf", valores),
    municipio,
    setMunicipio: (valores: string[]) => definirLista("municipio", valores),
    cnes,
    setCnes: (valores: string[]) => definirLista("cnes", valores),
    equipamento,
    setEquipamento: (valores: string[]) => definirLista("equipamento", valores),
    classeEquipamento,
    setClasseEquipamento: (valor: ClasseEquipamento) =>
      definirFiltro("classe", valor === "prioritario" ? null : valor),
    situacao,
    setSituacao: (valores: string[]) => definirLista("situacao", valores),
    anoInicio,
    setAnoInicio: (valor: string | null) => definirFiltro("ano_inicio", valor),
    anoFim,
    setAnoFim: (valor: string | null) => definirFiltro("ano_fim", valor),
    programa,
    setPrograma: (valores: string[]) => definirLista("programa", valores),
    tipoContratacao,
    setTipoContratacao: (valores: string[]) =>
      definirLista("tipo_contratacao", valores),
    monitorado,
    setMonitorado: (valor: string | null) =>
      definirFiltro(
        "monitorado",
        valor === "sim" || valor === "nao" ? valor : null,
      ),
    pagina,
    setPagina,
    pageSize: TAMANHO_PAGINA_DADOS_OFICIAIS,
    hasFiltros: PARAMETROS.some((parametro) => searchParams.has(parametro)),
    limparFiltros,
  };
}
