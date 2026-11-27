import { Fragment, useState, type ComponentProps } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { OPCOES_REFERENCIA_GESTAO } from "@/lib/referencia-periodo-painel";
import { normalizarTexto } from "@/utils/texto";

export type Opcao = { value: string; label: string; group?: string };

export function CampoSelect({
  rotulo,
  ...props
}: ComponentProps<"select"> & { rotulo: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium">
      {rotulo}
      <select
        {...props}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
      />
    </label>
  );
}

export function Opcoes({
  rotulo,
  opcoes,
  valor,
  selecionar,
  todos,
  pesquisar = false,
}: {
  rotulo: string;
  opcoes: (Opcao & { desabilitada?: boolean })[];
  valor: string | null;
  selecionar: (valor: string | null) => void;
  todos?: string;
  pesquisar?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const termo = normalizarTexto(busca);
  const visiveis = opcoes.filter(({ label }) =>
    normalizarTexto(label).includes(termo),
  );
  const itens =
    todos === undefined
      ? visiveis
      : [
          { value: null, label: todos, desabilitada: false, group: undefined },
          ...visiveis,
        ];
  return (
    <div className="space-y-2">
      {pesquisar && (
        <Input
          type="search"
          aria-label={`Pesquisar em ${rotulo}`}
          placeholder={`Pesquisar ${rotulo.toLocaleLowerCase("pt-BR")}`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      )}
      <div
        role="group"
        aria-label={rotulo}
        className="max-h-52 space-y-0.5 overflow-y-auto"
      >
        {itens.map(({ value, label, desabilitada, group }, indice) => (
          <Fragment key={value ?? ""}>
            {group && group !== itens[indice - 1]?.group && (
              <h3 className="mt-1 border-t border-border px-2.5 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
                {group}
              </h3>
            )}
            <button
              type="button"
              disabled={desabilitada}
              aria-pressed={value === valor}
              onClick={() => selecionar(value)}
              className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs enabled:hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-pressed:bg-primary/10 aria-pressed:font-semibold aria-pressed:text-primary"
            >
              {label}
              {value === valor && (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              )}
            </button>
          </Fragment>
        ))}
        {visiveis.length === 0 && (
          <p
            role="status"
            className="px-2.5 py-2 text-xs text-muted-foreground"
          >
            Nenhuma opção encontrada.
          </p>
        )}
      </div>
    </div>
  );
}

export function PeriodoFiltros({
  filtros,
}: {
  filtros: FiltrosMonitoramentoInterno;
}) {
  return (
    <>
      {filtros.temReferencias && (
        <CampoSelect
          rotulo="Referência"
          value={filtros.referencia}
          onChange={(e) =>
            filtros.setReferencia(
              e.target.value === "ano_instrumento" ? null : e.target.value,
            )
          }
        >
          {OPCOES_REFERENCIA_GESTAO.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </CampoSelect>
      )}
      <div className="grid grid-cols-2 gap-2">
        <CampoSelect
          rotulo="Ano inicial"
          value={filtros.anoInicio ?? ""}
          onChange={(e) => filtros.setAnoInicio(e.target.value || null)}
        >
          <option value="">Sem início</option>
          {filtros.anoOptions
            .filter(
              ({ value }) =>
                !filtros.anoFim || Number(value) <= Number(filtros.anoFim),
            )
            .map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </CampoSelect>
        <CampoSelect
          rotulo="Ano final"
          value={filtros.anoFim ?? ""}
          onChange={(e) => filtros.setAnoFim(e.target.value || null)}
        >
          <option value="">Sem fim</option>
          {filtros.anoOptions
            .filter(
              ({ value }) =>
                !filtros.anoInicio ||
                Number(value) >= Number(filtros.anoInicio),
            )
            .map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </CampoSelect>
      </div>
      {(filtros.anoInicio || filtros.anoFim) &&
        filtros.semDataNaReferencia > 0 && (
          <p className="text-xs text-muted-foreground">
            {filtros.semDataNaReferencia} instrumentos sem essa data ficam fora
            do período.
          </p>
        )}
    </>
  );
}
