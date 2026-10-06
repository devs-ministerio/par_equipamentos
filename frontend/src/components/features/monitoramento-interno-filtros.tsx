import { AnoIntervaloFilter } from "@/components/common/ano-intervalo-filter";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
import { SearchInput } from "@/components/common/search-input";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";

export function MonitoramentoInternoFiltros({
  filtros,
}: {
  filtros: FiltrosMonitoramentoInterno;
}) {
  return (
    <FilterWorkspace
      hasAnyFilter={filtros.hasFiltros}
      onClear={filtros.limparFiltros}
      contagem={`${filtros.filtrados.length} de ${filtros.total} instrumentos`}
    >
      <SearchInput
        value={filtros.busca}
        onChange={filtros.setBusca}
        placeholder="Buscar número, convenente, CNES ou município"
        width={162}
      />
      <SingleSelectFilter
        placeholder="Tipo de contratação"
        options={filtros.tipoContratacaoOptions}
        value={filtros.tipoContratacao}
        onChange={filtros.setTipoContratacao}
        clearLabel="Tipo de contratação"
        minWidth={170}
      />
      <SingleSelectFilter
        placeholder="CNES"
        options={filtros.cnesOptions}
        value={filtros.cnes}
        onChange={filtros.setCnes}
        clearLabel="CNES"
        minWidth={120}
      />
      <SingleSelectFilter
        placeholder="UF"
        options={filtros.ufOptions}
        value={filtros.uf}
        onChange={filtros.setUf}
        clearLabel="UF"
        minWidth={100}
      />
      <SingleSelectFilter
        placeholder="Município"
        options={filtros.municipioOptions}
        value={filtros.municipio}
        onChange={filtros.setMunicipio}
        clearLabel="Município"
        minWidth={150}
      />
      <div
        role="group"
        aria-label="Classificação e equipamento"
        className="flex w-full min-w-0 flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center sm:gap-1.5 sm:rounded-md sm:outline sm:outline-1 sm:outline-border sm:outline-offset-2"
      >
        <SingleSelectFilter
          placeholder="Prioritário"
          options={[
            { value: "todos", label: "Todos" },
            { value: "prioritario", label: "Prioritários" },
            { value: "outro", label: "Outros identificados" },
          ]}
          value={filtros.classeEquipamento}
          onChange={(valor) =>
            filtros.setClasseEquipamento(
              (valor ?? "todos") as typeof filtros.classeEquipamento,
            )
          }
          clearLabel="Todos"
          minWidth={125}
        />
        <SingleSelectFilter
          placeholder="Equipamento"
          options={filtros.equipamentoOptions}
          value={filtros.equipamento}
          onChange={filtros.setEquipamento}
          clearLabel="Equipamento"
          minWidth={180}
        />
      </div>
      <SingleSelectFilter
        placeholder="Situação"
        options={filtros.situacaoOptions}
        value={filtros.situacao}
        onChange={filtros.setSituacao}
        clearLabel="Situação"
        minWidth={140}
      />
      <SingleSelectFilter
        placeholder="Programas"
        options={filtros.programaOptions}
        value={filtros.programa}
        onChange={filtros.setPrograma}
        clearLabel="Programas"
        minWidth={160}
      />
      <AnoIntervaloFilter
        options={filtros.anoOptions}
        inicio={filtros.anoInicio}
        fim={filtros.anoFim}
        onInicioChange={filtros.setAnoInicio}
        onFimChange={filtros.setAnoFim}
      />
    </FilterWorkspace>
  );
}
