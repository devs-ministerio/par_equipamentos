import {
  Activity,
  Building2,
  CalendarRange,
  Layers,
  MapPin,
  Search,
  Stethoscope,
} from "lucide-react";
import { BarraFiltros } from "@/components/common/barra-filtros";
import type { Controle } from "@/components/common/controles-filtro";
import type { RecortePainel } from "@/components/common/chips-filtros-ativos";
import {
  OpcoesMultiplas,
  type OpcaoFiltro,
} from "@/components/common/opcoes-multiplas";
import { Input } from "@/components/ui/input";
import type { EstagioProposta } from "@/lib/proposta-status";
import type { PropostasFiltros as Filtros } from "@/hooks/use-propostas-filtros";
import { CampoSelect } from "./painel-gestao-filtros-campos";

/** Filtros de Linhas de financiamento no mesmo padrão do Painel de gestão. */
export function PropostasFiltros({
  filtros: f,
  modo,
}: {
  filtros: Filtros;
  modo: EstagioProposta;
}) {
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
    ...(modo !== "tramitacao"
      ? [
          multipla(
            "CNES",
            Building2,
            o.cnes,
            f.cnes,
            f.setCnes,
            "Todos os CNES",
          ),
        ]
      : []),
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
  if (modo !== "tramitacao") lista("CNES", f.cnes, o.cnes, () => f.setCnes([]));
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

  return (
    <BarraFiltros
      controles={controles}
      recortes={recortes}
      onLimpar={f.limparFiltros}
      rotulo="Filtros de linhas de financiamento"
    />
  );
}
