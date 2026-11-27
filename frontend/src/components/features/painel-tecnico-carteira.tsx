import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PainelTecnicoCarteiraLinha } from "@/components/features/painel-tecnico-carteira-linha";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/common/sortable-table-head";
import {
  filtrarEOrdenarCarteira,
  type ChaveOrdem,
  type OrdemCarteira,
} from "@/lib/painel-tecnico-carteira-linhas";
import {
  ROTULO_FILTRO,
  type FiltroCarteira,
} from "@/lib/painel-tecnico-filtro";
import type { LinhaCarteira } from "@/services/painel-tecnico";

const PASSO = 25;

export function PainelTecnicoCarteira({
  linhas,
  filtro,
  onLimpar,
  total,
  chips = [],
}: {
  linhas: LinhaCarteira[];
  filtro: FiltroCarteira;
  onLimpar: () => void;
  total?: number;
  chips?: { rotulo: string; onRemover: () => void }[];
}) {
  const queryClient = useQueryClient();
  const atualizar = () =>
    queryClient.invalidateQueries({ queryKey: ["painel-tecnico"] });
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<OrdemCarteira>({
    chave: "valor",
    dir: "desc",
  });
  const [visiveis, setVisiveis] = useState(PASSO);
  const filtradas = useMemo(
    () => filtrarEOrdenarCarteira(linhas, filtro, busca, ordem),
    [linhas, filtro, busca, ordem],
  );

  const cab = (chave: ChaveOrdem, texto: string, align?: "right") => (
    <SortableTableHead
      ativo={ordem.chave === chave}
      direcao={ordem.dir}
      align={align}
      onToggle={() =>
        setOrdem((o) => ({
          chave,
          dir: o.chave === chave && o.dir === "desc" ? "asc" : "desc",
        }))
      }
    >
      {texto}
    </SortableTableHead>
  );

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="m-0 mr-auto text-sm font-medium tabular-nums">
          {filtradas.length} de {total ?? linhas.length} instrumentos
        </p>
        <Input
          className="max-w-xs"
          aria-label="Buscar instrumento, município ou CNES"
          placeholder="Buscar instrumento, município ou CNES"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setVisiveis(PASSO);
          }}
        />
        {chips.map((c) => (
          <Badge
            key={c.rotulo}
            variant="secondary"
            className="h-7 gap-2 px-3 text-sm"
          >
            {c.rotulo}
            <button
              type="button"
              className="cursor-pointer font-semibold text-primary hover:underline"
              aria-label={`Remover filtro ${c.rotulo}`}
              onClick={c.onRemover}
            >
              Limpar
            </button>
          </Badge>
        ))}
        {filtro !== "todos" && (
          <Badge variant="secondary" className="h-7 gap-2 px-3 text-sm">
            {ROTULO_FILTRO[filtro]}
            <button
              type="button"
              className="cursor-pointer font-semibold text-primary hover:underline"
              aria-label={`Remover filtro ${ROTULO_FILTRO[filtro]}`}
              onClick={onLimpar}
            >
              Limpar
            </button>
          </Badge>
        )}
      </div>
      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum instrumento com este filtro.
        </p>
      ) : (
        <Table>
          <TableHeader className="[&_button]:font-[inherit] [&_button]:text-[length:inherit] [&_button]:uppercase [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide">
            <TableRow>
              {cab("numero", "Instrumento")}
              {cab("municipio", "Município")}
              <TableHead>CNES</TableHead>
              {cab("situacao", "Situação")}
              {cab("acoes", "N.º de Ações", "right")}
              {cab("eventos", "N.º de Eventos", "right")}
              {cab("valor", "Valor global", "right")}
              <TableHead className="text-center">Monitoramento</TableHead>
              <TableHead>Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.slice(0, visiveis).map((l) => (
              <PainelTecnicoCarteiraLinha
                key={l.numero}
                l={l}
                aoAtualizar={atualizar}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {filtradas.length > visiveis && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisiveis((v) => v + PASSO)}
          >
            Mostrar mais
          </Button>
        </div>
      )}
    </section>
  );
}
