import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizarTexto } from "@/utils/texto";

export type OpcaoFiltro = { value: string; label: string };

/** Lista de opções com várias escolhas, no mesmo visual de `Opcoes`; "Todos" limpa a seleção. */
export function OpcoesMultiplas({
  rotulo,
  opcoes,
  selecionados,
  alterar,
  todos,
  pesquisar = false,
}: {
  rotulo: string;
  opcoes: OpcaoFiltro[];
  selecionados: string[];
  alterar: (valores: string[]) => void;
  todos: string;
  pesquisar?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const termo = normalizarTexto(busca);
  const visiveis = opcoes.filter(({ label }) =>
    normalizarTexto(label).includes(termo),
  );
  const alternar = (valor: string) =>
    alterar(
      selecionados.includes(valor)
        ? selecionados.filter((item) => item !== valor)
        : [...selecionados, valor],
    );
  const itemClasse =
    "flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-pressed:bg-primary/10 aria-pressed:font-semibold aria-pressed:text-primary";
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
        <button
          type="button"
          aria-pressed={selecionados.length === 0}
          onClick={() => alterar([])}
          className={itemClasse}
        >
          {todos}
          {selecionados.length === 0 && (
            <Check className="size-3.5 shrink-0" aria-hidden="true" />
          )}
        </button>
        {visiveis.map(({ value, label }) => {
          const marcado = selecionados.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={marcado}
              onClick={() => alternar(value)}
              className={itemClasse}
            >
              {label}
              {marcado && (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              )}
            </button>
          );
        })}
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
