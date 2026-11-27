import {
  Activity,
  Building2,
  CalendarRange,
  Layers,
  MapPin,
  Eye,
  Search,
  Stethoscope,
} from "lucide-react";
import { BarraFiltros } from "@/components/common/barra-filtros";
import type { Controle } from "@/components/common/controles-filtro";
import {
  OpcoesMultiplas,
  type OpcaoFiltro,
} from "@/components/common/opcoes-multiplas";
import { Input } from "@/components/ui/input";
import type { PropostasFiltros as Filtros } from "@/hooks/use-propostas-filtros";
import { CampoSelect } from "./painel-gestao-filtros-campos";
import {
  ESTAGIOS,
  montarRecortesPropostas,
} from "./propostas-filtros-recortes";

/** Filtros de Linhas de financiamento no mesmo padrão do Painel de gestão. */
export function PropostasFiltros({ filtros: f }: { filtros: Filtros }) {
  const o = f.opcoes;
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
  const anos = (inicio: boolean) =>
    o.ano.filter(({ value }) =>
      inicio
        ? !f.anoFim || Number(value) <= Number(f.anoFim)
        : !f.anoInicio || Number(value) >= Number(f.anoInicio),
    );
  const controles: Controle[] = [
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
            aria-label="Buscar proposta"
            placeholder="Proposta, proponente, CNES ou município"
            value={f.busca}
            onChange={(e) => f.setBusca(e.target.value)}
          />
        </form>
      ),
    },
    multipla(
      "Etapa",
      Eye,
      ESTAGIOS,
      f.estagio,
      f.setEstagio,
      "Todas as etapas",
    ),
    {
      rotulo: "Período",
      icone: CalendarRange,
      ativo: !!(f.anoInicio || f.anoFim),
      conteudo: () => (
        <div className="grid grid-cols-2 gap-2">
          <CampoSelect
            rotulo="Ano inicial"
            value={f.anoInicio ?? ""}
            onChange={(e) => f.setAnoInicio(e.target.value || null)}
          >
            <option value="">Sem início</option>
            {anos(true).map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </CampoSelect>
          <CampoSelect
            rotulo="Ano final"
            value={f.anoFim ?? ""}
            onChange={(e) => f.setAnoFim(e.target.value || null)}
          >
            <option value="">Sem fim</option>
            {anos(false).map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </CampoSelect>
        </div>
      ),
    },
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
    multipla(
      "Equipamento",
      Stethoscope,
      o.equipamento,
      f.equipamento,
      f.setEquipamento,
      "Todos os equipamentos",
    ),
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

  const recortes = montarRecortesPropostas(f);

  return (
    <BarraFiltros
      controles={controles}
      recortes={recortes}
      onLimpar={f.limparFiltros}
      rotulo="Filtros de linhas de financiamento"
    />
  );
}
