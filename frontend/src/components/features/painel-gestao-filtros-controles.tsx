import {
  Activity,
  Building2,
  Layers,
  CalendarRange,
  ClipboardList,
  MapPin,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Controle } from "@/components/common/controles-filtro";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { CLASSES_FILTRO_EQUIPAMENTO } from "@/lib/monitoramento-filtro-equipamentos";
import {
  CampoSelect,
  Opcoes,
  PeriodoFiltros,
  type Opcao,
} from "./painel-gestao-filtros-campos";

/** Os seis controles do filtro mínimo do painel, com o estado "ativo" de cada um. */
export function montarControlesFiltro(
  filtros: FiltrosMonitoramentoInterno,
  /** Inclui CNES, Situação e Programas (a Mesa de trabalho mantém todos os filtros). */
  completo = false,
): Controle[] {
  const base: Controle[] = [
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
  if (!completo) return base;
  const lista = (
    rotulo: string,
    icone: Controle["icone"],
    opcoes: Opcao[],
    valor: string | null,
    todos: string,
    definir: (valor: string | null) => void,
  ): Controle => ({
    rotulo,
    icone,
    ativo: !!valor,
    conteudo: (fechar) => (
      <Opcoes
        rotulo={rotulo}
        opcoes={opcoes}
        valor={valor}
        todos={todos}
        selecionar={(escolhido) => {
          definir(escolhido);
          fechar();
        }}
        pesquisar
      />
    ),
  });
  const [busca, periodo, contratacao, local, equipamento, responsavel] = base;
  return [
    busca,
    periodo,
    contratacao,
    local,
    lista(
      "CNES",
      Building2,
      filtros.cnesOptions,
      filtros.cnes,
      "Todos os CNES",
      filtros.setCnes,
    ),
    equipamento,
    lista(
      "Situação",
      Activity,
      filtros.situacaoOptions,
      filtros.situacao,
      "Todas as situações",
      filtros.setSituacao,
    ),
    lista(
      "Programas",
      Layers,
      filtros.programaOptions,
      filtros.programa,
      "Todos os programas",
      filtros.setPrograma,
    ),
    responsavel,
  ];
}
