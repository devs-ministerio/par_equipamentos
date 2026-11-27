import type { RecortePainel } from "@/components/common/chips-filtros-ativos";
import type { OpcaoFiltro } from "@/components/common/opcoes-multiplas";
import type { PropostasFiltros as Filtros } from "@/hooks/use-propostas-filtros";

export const ESTAGIOS: OpcaoFiltro[] = [
  { value: "tramitacao", label: "Proposta" },
  { value: "confirmada", label: "Celebrado" },
];

/** Etiquetas removíveis dos filtros ativos de Linhas de financiamento. */
export function montarRecortesPropostas(f: Filtros): RecortePainel[] {
  const o = f.opcoes;
  const recortes: RecortePainel[] = [];
  const rotuloDe = (opcoes: OpcaoFiltro[], valor: string) =>
    opcoes.find((opcao) => opcao.value === valor)?.label ?? valor;
  const lista = (
    rotulo: string,
    valores: string[],
    opcoes: OpcaoFiltro[],
    limpar: () => void,
  ) => {
    if (valores.length)
      recortes.push({
        rotulo,
        valor: valores.map((v) => rotuloDe(opcoes, v)).join(", "),
        remover: limpar,
      });
  };
  if (f.busca.trim())
    recortes.push({
      rotulo: "Busca",
      valor: f.busca.trim(),
      remover: () => f.setBusca(""),
    });
  lista("UF", f.uf, o.uf, () => f.setUf([]));
  lista("Município", f.municipio, o.municipio, () => f.setMunicipio([]));
  lista("CNES", f.cnes, o.cnes, () => f.setCnes([]));
  lista("Etapa", f.estagio, ESTAGIOS, () => f.setEstagio([]));
  lista("Equipamento", f.equipamento, o.equipamento, () =>
    f.setEquipamento([]),
  );
  lista("Situação", f.situacao, o.situacao, () => f.setSituacao([]));
  lista("Programa", f.programa, o.programa, () => f.setPrograma([]));
  if (f.anoInicio || f.anoFim)
    recortes.push({
      rotulo: "Período",
      valor:
        f.anoInicio === f.anoFim
          ? (f.anoInicio ?? "")
          : `${f.anoInicio ?? "…"} – ${f.anoFim ?? "…"}`,
      remover: () => {
        f.setAnoInicio(null);
        f.setAnoFim(null);
      },
    });
  return recortes;
}
