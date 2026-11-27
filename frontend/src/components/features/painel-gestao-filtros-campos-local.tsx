import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { CLASSES_FILTRO_EQUIPAMENTO } from "@/lib/monitoramento-filtro-equipamentos";
import { CampoSelect, Opcoes } from "./painel-gestao-filtros-campos";

interface Props {
  filtros: FiltrosMonitoramentoInterno;
  fechar: () => void;
}

export function LocalFiltros({ filtros, fechar }: Props) {
  return (
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
  );
}

export function EquipamentoFiltros({ filtros, fechar }: Props) {
  return (
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
  );
}
