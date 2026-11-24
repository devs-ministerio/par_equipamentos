import {
  Activity,
  Building2,
  ClipboardList,
  Layers,
  MapPin,
  Stethoscope,
} from "lucide-react";
import type { Controle } from "@/components/common/controles-filtro";
import type { RecortePainel } from "@/components/common/chips-filtros-ativos";
import type { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import { Opcoes, type Opcao } from "./painel-gestao-filtros-campos";
import { periodoRelatorio } from "./relatorio-filtros-periodo";

export type FiltrosRelatorio = ReturnType<
  typeof useRelatorioInstrumentosFiltros
>;

export interface OpcoesRelatorio {
  tipo: Opcao[];
  uf: Opcao[];
  municipio: Opcao[];
  cnes: Opcao[];
  equipamento: Opcao[];
  situacao: Opcao[];
  programa: Opcao[];
  ano: Opcao[];
}

/** Os filtros do relatório como botões com popover, no padrão do Painel de gestão. */
export function montarControlesRelatorio(
  f: FiltrosRelatorio,
  o: OpcoesRelatorio,
): Controle[] {
  const unica = (
    rotulo: string,
    icone: Controle["icone"],
    opcoes: Opcao[],
    valor: string | null,
    alterar: (valor: string | null) => void,
    todos: string,
  ): Controle => ({
    rotulo,
    icone,
    ativo: valor !== null,
    conteudo: (fechar) => (
      <Opcoes
        rotulo={rotulo}
        opcoes={opcoes}
        valor={valor}
        selecionar={(novo) => {
          alterar(novo);
          fechar();
        }}
        todos={todos}
        pesquisar
      />
    ),
  });
  return [
    periodoRelatorio(f, o),
    unica(
      "Contratação",
      ClipboardList,
      o.tipo,
      f.tipoContratacao,
      f.setTipoContratacao,
      "Todas as contratações",
    ),
    unica("UF", MapPin, o.uf, f.uf, f.setUf, "Todas as UFs"),
    unica(
      "Município",
      MapPin,
      o.municipio,
      f.municipio,
      f.setMunicipio,
      "Todos os municípios",
    ),
    unica("CNES", Building2, o.cnes, f.cnes, f.setCnes, "Todos os CNES"),
    unica(
      "Equipamento",
      Stethoscope,
      o.equipamento,
      f.equipamento,
      f.setEquipamento,
      "Todos os equipamentos",
    ),
    unica(
      "Situação",
      Activity,
      o.situacao,
      f.situacao,
      f.setSituacao,
      "Todas as situações",
    ),
    unica(
      "Programas",
      Layers,
      o.programa,
      f.programa,
      f.setPrograma,
      "Todos os programas",
    ),
  ];
}

/** Etiquetas removíveis dos filtros ativos do relatório. */
export function montarRecortesRelatorio(
  f: FiltrosRelatorio,
  o: OpcoesRelatorio,
): RecortePainel[] {
  const recortes: RecortePainel[] = [];
  const unico = (
    rotulo: string,
    valor: string | null,
    opcoes: Opcao[],
    limpar: () => void,
  ) => {
    if (valor)
      recortes.push({
        rotulo,
        valor: opcoes.find((op) => op.value === valor)?.label ?? valor,
        remover: limpar,
      });
  };
  unico("Contratação", f.tipoContratacao, o.tipo, () =>
    f.setTipoContratacao(null),
  );
  unico("UF", f.uf, o.uf, () => f.setUf(null));
  unico("Município", f.municipio, o.municipio, () => f.setMunicipio(null));
  unico("CNES", f.cnes, o.cnes, () => f.setCnes(null));
  unico("Equipamento", f.equipamento, o.equipamento, () =>
    f.setEquipamento(null),
  );
  unico("Situação", f.situacao, o.situacao, () => f.setSituacao(null));
  unico("Programa", f.programa, o.programa, () => f.setPrograma(null));
  const inicio = f.anoInicio;
  const fim = f.anoFim;
  if (inicio || fim)
    recortes.push({
      rotulo: "Período",
      valor:
        inicio === fim ? (inicio ?? "") : `${inicio ?? "…"} – ${fim ?? "…"}`,
      remover: () => {
        f.setAnoInicio(null);
        f.setAnoFim(null);
      },
    });
  return recortes;
}
