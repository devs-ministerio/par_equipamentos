import { AnoIntervaloFilter } from "@/components/common/ano-intervalo-filter";
import { FilterWorkspace } from "@/components/common/filter-workspace";
import { SingleSelectFilter } from "@/components/common/single-select-filter";
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
        className="flex flex-wrap items-center gap-1.5 rounded-md outline outline-1 outline-border outline-offset-2"
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
