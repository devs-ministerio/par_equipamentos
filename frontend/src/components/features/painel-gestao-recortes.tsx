import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { OPCOES_REFERENCIA_GESTAO } from "@/lib/referencia-periodo-painel";
import { CLASSES_FILTRO_EQUIPAMENTO } from "@/lib/monitoramento-filtro-equipamentos";
import type { Opcao } from "./painel-gestao-filtros-campos";

export type RecortePainel = {
  rotulo: string;
  valor: string;
  remover: () => void;
};

export function PainelGestaoRecortes({
  filtros,
  recortesGraficos,
  limpar,
}: {
  filtros: FiltrosMonitoramentoInterno;
  recortesGraficos: RecortePainel[];
  limpar: () => void;
}) {
  const recortes: RecortePainel[] = [...recortesGraficos];
  const adicionar = (
    rotulo: string,
    valor: string | null,
    remover: () => void,
  ) => {
    if (valor) recortes.push({ rotulo, valor, remover });
  };
  const label = (valor: string | null, opcoes: readonly Opcao[]) =>
    opcoes.find((o) => o.value === valor)?.label ?? valor;
  adicionar("Busca", filtros.busca.trim(), () => filtros.setBusca(""));
  adicionar("Contratação", filtros.tipoContratacao, () =>
    filtros.setTipoContratacao(null),
  );
  adicionar("UF", filtros.uf, () => filtros.setUf(null));
  adicionar(
    "Município",
    label(filtros.municipio, filtros.municipioOptions),
    () => filtros.setMunicipio(null),
  );
  adicionar(
    "Equipamento",
    label(filtros.equipamento, filtros.equipamentoOptions),
    () => filtros.setEquipamento(null),
  );
  adicionar(
    "Lista de equipamentos",
    filtros.classeEquipamento === "todos"
      ? null
      : label(filtros.classeEquipamento, [...CLASSES_FILTRO_EQUIPAMENTO]),
    () => filtros.setClasseEquipamento("todos"),
  );
  adicionar("Responsável", filtros.responsavel, () =>
    filtros.setResponsavel(null),
  );
  adicionar(
    "Referência",
    label(
      filtros.referencia === "ano_instrumento" ? null : filtros.referencia,
      OPCOES_REFERENCIA_GESTAO,
    ),
    () => filtros.setReferencia(null),
  );
  adicionar(
    "Período",
    filtros.anoInicio || filtros.anoFim
      ? filtros.anoInicio === filtros.anoFim
        ? filtros.anoInicio
        : `${filtros.anoInicio ?? "…"} – ${filtros.anoFim ?? "…"}`
      : null,
    () => filtros.setPeriodo(null, null),
  );
  adicionar("Situação", filtros.situacao, () => filtros.setSituacao(null));
  adicionar("CNES", filtros.cnes, () => filtros.setCnes(null));
  adicionar("Programa", filtros.programa, () => filtros.setPrograma(null));

  if (!recortes.length) return null;

  return (
    <div
      role="group"
      aria-label="Filtros ativos"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {recortes.map(({ rotulo, valor, remover }) => (
        <button
          key={rotulo}
          type="button"
          aria-label={`Remover filtro ${rotulo}: ${valor}`}
          title={`${rotulo}: ${valor}`}
          className="flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={remover}
        >
          <span className="truncate">
            {rotulo}: {valor}
          </span>
          <X className="size-3 shrink-0" aria-hidden="true" />
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={limpar}
      >
        Limpar filtros
      </Button>
    </div>
  );
}
