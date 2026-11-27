import {
  Activity,
  Building2,
  CalendarRange,
  ClipboardList,
  Eye,
  Layers,
  MapPin,
  Search,
  Stethoscope,
} from "lucide-react";
import type { Controle } from "@/components/common/controles-filtro";
import {
  OpcoesMultiplas,
  type OpcaoFiltro,
} from "@/components/common/opcoes-multiplas";
import { Input } from "@/components/ui/input";
import { Opcoes } from "./painel-gestao-filtros-campos";
import {
  EquipamentoDadosOficiais,
  PeriodoDadosOficiais,
} from "./dados-oficiais-filtros-campos";
import type {
  FiltrosDadosOficiais,
  OpcoesDadosOficiais,
} from "./dados-oficiais-filtros-tipos";

/** Os filtros de Dados oficiais como botões com popover, no padrão do Painel de gestão. */
export function montarControlesDadosOficiais(
  f: FiltrosDadosOficiais,
  o: OpcoesDadosOficiais,
): Controle[] {
  const multipla = (
    rotulo: string,
    icone: Controle["icone"],
    opcoes: OpcaoFiltro[],
    selecionados: string[],
    alterar: (valores: string[]) => void,
    todos: string,
  ): Controle => ({
    rotulo,
    icone,
    ativo: selecionados.length > 0,
    conteudo: () => (
      <OpcoesMultiplas
        rotulo={rotulo}
        opcoes={opcoes}
        selecionados={selecionados}
        alterar={alterar}
        todos={todos}
        pesquisar
      />
    ),
  });
  return [
    {
      rotulo: "Busca",
      icone: Search,
      ativo: !!f.busca.trim(),
      conteudo: (fechar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fechar();
          }}
        >
          <Input
            type="search"
            aria-label="Buscar instrumento"
            placeholder="Número, convenente, CNES ou município"
            value={f.busca}
            onChange={(e) => f.setBusca(e.target.value)}
          />
        </form>
      ),
    },
    {
      rotulo: "Etapa",
      icone: Eye,
      ativo: !!f.monitorado,
      conteudo: (fechar) => (
        <Opcoes
          rotulo="Etapa"
          opcoes={[
            { value: "nao", label: "Celebrado" },
            { value: "sim", label: "Em monitoramento" },
          ]}
          valor={f.monitorado}
          todos="Todas as etapas"
          selecionar={(valor) => {
            f.setMonitorado(valor);
            fechar();
          }}
        />
      ),
    },
    {
      rotulo: "Período",
      icone: CalendarRange,
      ativo: !!(f.anoInicio || f.anoFim),
      conteudo: () => <PeriodoDadosOficiais f={f} anos={o.ano} />,
    },
    multipla(
      "Contratação",
      ClipboardList,
      o.tipoContratacao,
      f.tipoContratacao,
      f.setTipoContratacao,
      "Todas as contratações",
    ),
    multipla("UF", MapPin, o.uf, f.uf, f.setUf, "Todas as UFs"),
    multipla(
      "Município",
      MapPin,
      o.municipio,
      f.municipio,
      f.setMunicipio,
      "Todos os municípios",
    ),
    multipla("CNES", Building2, o.cnes, f.cnes, f.setCnes, "Todos os CNES"),
    {
      rotulo: "Equipamento",
      icone: Stethoscope,
      ativo: f.equipamento.length > 0 || f.classeEquipamento !== "prioritario",
      conteudo: () => <EquipamentoDadosOficiais f={f} opcoes={o.equipamento} />,
    },
    multipla(
      "Situação",
      Activity,
      o.situacao,
      f.situacao,
      f.setSituacao,
      "Todas as situações",
    ),
    multipla(
      "Programas",
      Layers,
      o.programa,
      f.programa,
      f.setPrograma,
      "Todos os programas",
    ),
  ];
}
