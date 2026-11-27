import {
  FASES_ACOMPANHAMENTO,
  type FaseAcompanhamento,
} from "@/lib/fases-acompanhamento";
import type { SituacaoEquipamento } from "@/services/relatorios";

const SITUACOES = [
  ["planejado", "Planejado"],
  ["entregue", "Entregue, a inaugurar"],
  ["em_operacao", "Em operação"],
  ["cancelado", "Cancelado"],
] as const;

const FASES = FASES_ACOMPANHAMENTO.map((fase) => [fase, fase] as const);
const CLASSE_CHECKBOX =
  "size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function ListaFiltro<T extends string>({
  rotulo,
  opcoes,
  selecionadas,
  onChange,
}: {
  rotulo: string;
  opcoes: ReadonlyArray<readonly [T, string]>;
  selecionadas: T[] | null;
  onChange: (valores: T[] | null) => void;
}) {
  const todasSelecionadas = selecionadas === null;
  const total = opcoes.length;
  const selecionadasSet = new Set(
    selecionadas ?? opcoes.map(([valor]) => valor),
  );

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold">{rotulo}</legend>
      <div className="rounded-xl border border-border">
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-t-xl border-b bg-muted/50 px-3 py-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={todasSelecionadas}
            ref={(elemento) => {
              if (elemento)
                elemento.indeterminate =
                  !todasSelecionadas && selecionadasSet.size > 0;
            }}
            onChange={(evento) => onChange(evento.target.checked ? null : [])}
            className={CLASSE_CHECKBOX}
          />
          <span className="flex-1">Selecionar todos</span>
          <span
            aria-hidden="true"
            className="text-xs tabular-nums text-muted-foreground"
          >
            {selecionadasSet.size}/{total}
          </span>
        </label>
        <div className="grid max-h-32 overflow-y-auto overscroll-contain p-1 sm:grid-cols-2">
          {opcoes.map(([valor, nome]) => (
            <label
              key={valor}
              className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted/60"
            >
              <input
                type="checkbox"
                checked={selecionadasSet.has(valor)}
                onChange={(evento) => {
                  const novas = opcoes
                    .map(([opcao]) => opcao)
                    .filter((opcao) =>
                      opcao === valor
                        ? evento.target.checked
                        : selecionadasSet.has(opcao),
                    );
                  onChange(novas.length === total ? null : novas);
                }}
                className={CLASSE_CHECKBOX}
              />
              {nome}
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

export function RelatorioMonitoradosFiltros({
  equipamentos,
  selecionadas,
  fases,
  onSituacoesChange,
  onFasesChange,
}: {
  equipamentos: boolean;
  selecionadas: SituacaoEquipamento[] | null;
  fases: FaseAcompanhamento[] | null;
  onSituacoesChange: (valor: SituacaoEquipamento[] | null) => void;
  onFasesChange: (valor: FaseAcompanhamento[] | null) => void;
}) {
  return equipamentos ? (
    <ListaFiltro
      rotulo="Situação do equipamento"
      opcoes={SITUACOES}
      selecionadas={selecionadas}
      onChange={onSituacoesChange}
    />
  ) : (
    <ListaFiltro
      rotulo="Fase do monitoramento"
      opcoes={FASES}
      selecionadas={fases}
      onChange={onFasesChange}
    />
  );
}
