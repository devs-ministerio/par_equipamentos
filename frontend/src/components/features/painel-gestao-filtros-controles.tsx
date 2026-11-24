import { type ReactNode } from "react";
import {
  CalendarRange,
  ClipboardList,
  MapPin,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { CLASSES_FILTRO_EQUIPAMENTO } from "@/lib/monitoramento-filtro-equipamentos";
import {
  CampoSelect,
  Opcoes,
  PeriodoFiltros,
} from "./painel-gestao-filtros-campos";

export type Controle = {
  rotulo: string;
  icone: typeof Search;
  ativo: boolean;
  conteudo: (fechar: () => void) => ReactNode;
};

/** Os seis controles do filtro mínimo do painel, com o estado "ativo" de cada um. */
export function montarControlesFiltro(
  filtros: FiltrosMonitoramentoInterno,
): Controle[] {
  return [
    {
      rotulo: "Busca",
      icone: Search,
      ativo: !!filtros.busca.trim(),
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
            placeholder="Número ou nome do convenente"
            value={filtros.busca}
            onChange={(e) => filtros.setBusca(e.target.value)}
          />
        </form>
      ),
    },
    {
      rotulo: "Período",
      icone: CalendarRange,
      ativo: !!(
        filtros.anoInicio ||
        filtros.anoFim ||
        filtros.referencia !== "ano_instrumento"
      ),
      conteudo: () => <PeriodoFiltros filtros={filtros} />,
    },
    {
      rotulo: "Contratação",
      icone: ClipboardList,
      ativo: !!filtros.tipoContratacao,
      conteudo: (fechar) => (
        <Opcoes
          rotulo="Contratação"
          opcoes={filtros.tipoContratacaoOptions}
          valor={filtros.tipoContratacao}
          todos="Todas as contratações"
          selecionar={(valor) => {
            filtros.setTipoContratacao(valor);
            fechar();
          }}
        />
      ),
    },
    {
      rotulo: "UF / Município",
      icone: MapPin,
      ativo: !!(filtros.uf || filtros.municipio),
      conteudo: (fechar) => (
        <>
          <CampoSelect
            rotulo="UF"
            value={filtros.uf ?? ""}
            onChange={(e) => filtros.setUfComMunicipio(e.target.value || null)}
          >
            <option value="">Todas as UFs</option>
            {filtros.uf &&
              !filtros.ufOptions.some(({ value }) => value === filtros.uf) && (
                <option value={filtros.uf}>{filtros.uf}</option>
              )}
            {filtros.ufOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </CampoSelect>
          <Opcoes
            key={filtros.uf}
            rotulo="Município"
            opcoes={filtros.municipioOptionsPorUf}
            valor={filtros.municipio}
            todos="Todos os municípios"
            selecionar={(valor) => {
              filtros.setMunicipio(valor);
              fechar();
            }}
            pesquisar
          />
        </>
      ),
    },
    {
      rotulo: "Equipamento",
      icone: Stethoscope,
      ativo: !!(filtros.equipamento || filtros.classeEquipamento !== "todos"),
      conteudo: (fechar) => (
        <>
          <CampoSelect
            rotulo="Mostrar na lista"
            value={filtros.classeEquipamento}
            onChange={(e) => {
              const classe = CLASSES_FILTRO_EQUIPAMENTO.find(
                ({ value }) => value === e.target.value,
              );
              if (classe) filtros.setClasseEquipamento(classe.value);
            }}
          >
            {CLASSES_FILTRO_EQUIPAMENTO.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </CampoSelect>
          <Opcoes
            key={filtros.classeEquipamento}
            rotulo="Equipamento"
            opcoes={filtros.equipamentoOptions}
            valor={filtros.equipamento}
            todos="Todos os equipamentos"
            selecionar={(valor) => {
              filtros.setEquipamento(valor);
              fechar();
            }}
            pesquisar
          />
        </>
      ),
    },
    {
      rotulo: "Responsável",
      icone: UserRound,
      ativo: !!filtros.responsavel,
      conteudo: (fechar) => (
        <Opcoes
          rotulo="Responsável"
          opcoes={filtros.responsavelOptions}
          valor={filtros.responsavel}
          todos="Todos os responsáveis"
          selecionar={(valor) => {
            filtros.setResponsavel(valor);
            fechar();
          }}
          pesquisar
        />
      ),
    },
  ];
}
