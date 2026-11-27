import {
  OpcoesMultiplas,
  type OpcaoFiltro,
} from "@/components/common/opcoes-multiplas";
import { CampoSelect } from "./painel-gestao-filtros-campos";
import type { FiltrosDadosOficiais } from "./dados-oficiais-filtros-tipos";

const CLASSES = [
  { value: "prioritario", label: "Prioritários" },
  { value: "outro", label: "Outros identificados" },
] as const;

export function PeriodoDadosOficiais({
  f,
  anos,
}: {
  f: FiltrosDadosOficiais;
  anos: OpcaoFiltro[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <CampoSelect
        rotulo="Ano inicial"
        value={f.anoInicio ?? ""}
        onChange={(e) => f.setAnoInicio(e.target.value || null)}
      >
        <option value="">Sem início</option>
        {anos
          .filter(({ value }) => !f.anoFim || Number(value) <= Number(f.anoFim))
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
        {anos
          .filter(
            ({ value }) => !f.anoInicio || Number(value) >= Number(f.anoInicio),
          )
          .map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
      </CampoSelect>
    </div>
  );
}

export function EquipamentoDadosOficiais({
  f,
  opcoes,
}: {
  f: FiltrosDadosOficiais;
  opcoes: OpcaoFiltro[];
}) {
  return (
    <>
      <CampoSelect
        rotulo="Mostrar na lista"
        value={f.classeEquipamento}
        onChange={(e) => {
          const classe = CLASSES.find(({ value }) => value === e.target.value);
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
        opcoes={opcoes}
        selecionados={f.equipamento}
        alterar={f.setEquipamento}
        todos="Todos os equipamentos"
        pesquisar
      />
    </>
  );
}
