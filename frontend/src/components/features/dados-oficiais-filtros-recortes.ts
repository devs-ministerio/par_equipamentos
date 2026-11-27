import type { RecortePainel } from "@/components/common/chips-filtros-ativos";
import type { OpcaoFiltro } from "@/components/common/opcoes-multiplas";
import type {
  FiltrosDadosOficiais,
  OpcoesDadosOficiais,
} from "./dados-oficiais-filtros-tipos";

/** Etiquetas removíveis dos filtros ativos de Dados oficiais. */
export function montarRecortesDadosOficiais(
  f: FiltrosDadosOficiais,
  o: OpcoesDadosOficiais,
): RecortePainel[] {
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
  lista("Contratação", f.tipoContratacao, o.tipoContratacao, () =>
    f.setTipoContratacao([]),
  );
  if (f.monitorado)
    recortes.push({
      rotulo: "Etapa",
      valor: f.monitorado === "sim" ? "Em monitoramento" : "Celebrado",
      remover: () => f.setMonitorado(null),
    });
  lista("UF", f.uf, o.uf, () => f.setUf([]));
  lista("Município", f.municipio, o.municipio, () => f.setMunicipio([]));
  lista("CNES", f.cnes, o.cnes, () => f.setCnes([]));
  if (f.classeEquipamento !== "prioritario")
    recortes.push({
      rotulo: "Lista de equipamentos",
      valor: "Outros identificados",
      remover: () => f.setClasseEquipamento("prioritario"),
    });
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
