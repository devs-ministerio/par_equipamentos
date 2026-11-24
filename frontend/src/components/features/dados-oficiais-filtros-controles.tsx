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
import type { RecortePainel } from "@/components/common/chips-filtros-ativos";
import {
  OpcoesMultiplas,
  type OpcaoFiltro,
} from "@/components/common/opcoes-multiplas";
import { Input } from "@/components/ui/input";
import type { useDadosOficiaisFiltros } from "@/hooks/use-dados-oficiais-filtros";
import { CampoSelect, Opcoes } from "./painel-gestao-filtros-campos";

export type FiltrosDadosOficiais = ReturnType<typeof useDadosOficiaisFiltros>;

export interface OpcoesDadosOficiais {
  tipoContratacao: OpcaoFiltro[];
  uf: OpcaoFiltro[];
  municipio: OpcaoFiltro[];
  cnes: OpcaoFiltro[];
  equipamento: OpcaoFiltro[];
  situacao: OpcaoFiltro[];
  programa: OpcaoFiltro[];
  ano: OpcaoFiltro[];
}

const CLASSES = [
  { value: "prioritario", label: "Prioritários" },
  { value: "outro", label: "Outros identificados" },
] as const;

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
            {o.ano
              .filter(
                ({ value }) => !f.anoFim || Number(value) <= Number(f.anoFim),
              )
              .map(({ value, label }) => (
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
            {o.ano
              .filter(
                ({ value }) =>
                  !f.anoInicio || Number(value) >= Number(f.anoInicio),
              )
              .map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </CampoSelect>
        </div>
      ),
    },
    multipla(
      "Contratação",
      ClipboardList,
      o.tipoContratacao,
      f.tipoContratacao,
      f.setTipoContratacao,
      "Todas as contratações",
    ),
    {
      rotulo: "Monitorado",
      icone: Eye,
      ativo: !!f.monitorado,
      conteudo: (fechar) => (
        <Opcoes
          rotulo="Monitorado"
          opcoes={[
            { value: "sim", label: "Sim" },
            { value: "nao", label: "Não" },
          ]}
          valor={f.monitorado}
          todos="Todos"
          selecionar={(valor) => {
            f.setMonitorado(valor);
            fechar();
          }}
        />
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
    {
      rotulo: "Equipamento",
      icone: Stethoscope,
      ativo: f.equipamento.length > 0 || f.classeEquipamento !== "prioritario",
      conteudo: () => (
        <>
          <CampoSelect
            rotulo="Mostrar na lista"
            value={f.classeEquipamento}
            onChange={(e) => {
              const classe = CLASSES.find(
                ({ value }) => value === e.target.value,
              );
              if (classe) f.setClasseEquipamento(classe.value);
            }}
          >
            {CLASSES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </CampoSelect>
          <OpcoesMultiplas
            key={f.classeEquipamento}
            rotulo="Equipamento"
            opcoes={o.equipamento}
            selecionados={f.equipamento}
            alterar={f.setEquipamento}
            todos="Todos os equipamentos"
            pesquisar
          />
        </>
      ),
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
      rotulo: "Monitorado",
      valor: f.monitorado === "sim" ? "Sim" : "Não",
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
