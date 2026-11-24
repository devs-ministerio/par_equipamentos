import {
  ChipsFiltrosAtivos,
  type RecortePainel,
} from "@/components/common/chips-filtros-ativos";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { OPCOES_REFERENCIA_GESTAO } from "@/lib/referencia-periodo-painel";
import { CLASSES_FILTRO_EQUIPAMENTO } from "@/lib/monitoramento-filtro-equipamentos";
import type { Opcao } from "./painel-gestao-filtros-campos";

export type { RecortePainel };

/** Filtros ativos do hook do monitoramento como etiquetas, após as dos gráficos. */
export function montarRecortes(
  filtros: FiltrosMonitoramentoInterno,
  recortesGraficos: RecortePainel[] = [],
): RecortePainel[] {
  const recortes: RecortePainel[] = [...recortesGraficos];
  const adicionar = (
    rotulo: string,
    valor: string | null,
    remover: () => void,
  ) => {
    if (valor) recortes.push({ rotulo, valor, remover });
  };
  const label = (valor: string | null, opcoes: readonly Opcao[]) =>
    opcoes.find((o) => o.value === valor)?.label ?? valor;
  adicionar("Busca", filtros.busca.trim(), () => filtros.setBusca(""));
  adicionar("Contratação", filtros.tipoContratacao, () =>
    filtros.setTipoContratacao(null),
  );
  adicionar("UF", filtros.uf, () => filtros.setUf(null));
  adicionar(
    "Município",
    label(filtros.municipio, filtros.municipioOptions),
    () => filtros.setMunicipio(null),
  );
  adicionar(
    "Equipamento",
    label(filtros.equipamento, filtros.equipamentoOptions),
    () => filtros.setEquipamento(null),
  );
  adicionar(
    "Lista de equipamentos",
    filtros.classeEquipamento === "todos"
      ? null
      : label(filtros.classeEquipamento, [...CLASSES_FILTRO_EQUIPAMENTO]),
    () => filtros.setClasseEquipamento("todos"),
  );
  adicionar("Responsável", filtros.responsavel, () =>
    filtros.setResponsavel(null),
  );
  adicionar(
    "Referência",
    label(
      filtros.referencia === "ano_instrumento" ? null : filtros.referencia,
      OPCOES_REFERENCIA_GESTAO,
    ),
    () => filtros.setReferencia(null),
  );
  adicionar(
    "Período",
    filtros.anoInicio || filtros.anoFim
      ? filtros.anoInicio === filtros.anoFim
        ? filtros.anoInicio
        : `${filtros.anoInicio ?? "…"} – ${filtros.anoFim ?? "…"}`
      : null,
    () => filtros.setPeriodo(null, null),
  );
  adicionar("Situação", filtros.situacao, () => filtros.setSituacao(null));
  adicionar("CNES", filtros.cnes, () => filtros.setCnes(null));
  adicionar("Programa", filtros.programa, () => filtros.setPrograma(null));

  return recortes;
}

export function PainelGestaoRecortes({
  filtros,
  recortesGraficos,
  limpar,
}: {
  filtros: FiltrosMonitoramentoInterno;
  recortesGraficos: RecortePainel[];
  limpar: () => void;
}) {
  return (
    <ChipsFiltrosAtivos
      recortes={montarRecortes(filtros, recortesGraficos)}
      limpar={limpar}
    />
  );
}
