import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { botaoIcone } from "@/components/features/equipamentos-instrumento-unidades";
import { AdicionarMonitoramentoButton } from "@/components/features/adicionar-monitoramento-button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/common/sortable-table-head";
import { PainelSecao } from "@/components/features/monitoramento-painel-visuals";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { capitalizarNome, normalizarTexto } from "@/utils/texto";
import {
  aplicaFiltro,
  ROTULO_FILTRO,
  type FiltroCarteira,
} from "@/lib/painel-tecnico-filtro";
import type { LinhaCarteira } from "@/services/painel-tecnico";

type Chave =
  | "numero"
  | "municipio"
  | "situacao"
  | "valor"
  | "acoes"
  | "eventos";
const PASSO = 25;

function valorOrdem(l: LinhaCarteira, c: Chave): string | number {
  if (c === "valor") return l.valor_global ?? -1;
  if (c === "acoes") return l.acoes;
  if (c === "eventos") return l.eventos;
  if (c === "municipio") return `${l.uf ?? ""} ${l.municipio ?? ""}`;
  if (c === "situacao") return (l.monitorado ? l.fase : l.situacao) ?? "";
  return l.numero;
}

export function PainelTecnicoCarteira({
  linhas,
  filtro,
  onLimpar,
}: {
  linhas: LinhaCarteira[];
  filtro: FiltroCarteira;
  onLimpar: () => void;
}) {
  const queryClient = useQueryClient();
  const atualizar = () =>
    queryClient.invalidateQueries({ queryKey: ["painel-tecnico"] });
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ chave: Chave; dir: "asc" | "desc" }>({
    chave: "valor",
    dir: "desc",
  });
  const [visiveis, setVisiveis] = useState(PASSO);
  const filtradas = useMemo(() => {
    const termo = normalizarTexto(busca);
    const lista = linhas.filter(
      (l) =>
        aplicaFiltro(l, filtro) &&
        (!termo ||
          normalizarTexto(
            `${l.numero} ${l.municipio ?? ""} ${l.uf ?? ""} ${l.cnes ?? ""} ${l.convenente ?? ""} ${l.titular ?? ""}`,
          ).includes(termo)),
    );
    const sinal = ordem.dir === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      const x = valorOrdem(a, ordem.chave);
      const y = valorOrdem(b, ordem.chave);
      return (x < y ? -1 : x > y ? 1 : 0) * sinal;
    });
  }, [linhas, filtro, busca, ordem]);

  const cab = (chave: Chave, texto: string, align?: "right") => (
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
    <PainelSecao
      titulo="Carteira da região"
      apoio={`${filtradas.length} de ${linhas.length} convênios`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Buscar instrumento, município ou CNES"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setVisiveis(PASSO);
          }}
        />
        {filtro !== "todos" && (
          <Badge variant="secondary" className="h-7 gap-2 px-3 text-sm">
            {ROTULO_FILTRO[filtro]}
            <button
              type="button"
              className="cursor-pointer font-semibold text-primary hover:underline"
              onClick={onLimpar}
            >
              Limpar
            </button>
          </Badge>
        )}
      </div>
      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum convênio com este filtro.
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
              <TableHead>Monitoramento</TableHead>
              <TableHead>Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.slice(0, visiveis).map((l) => (
              <TableRow key={l.numero}>
                <TableCell className="font-medium">{l.numero}</TableCell>
                <TableCell>
                  {[l.municipio ? capitalizarNome(l.municipio) : null, l.uf]
                    .filter(Boolean)
                    .join(" / ")}
                </TableCell>
                <TableCell className="tabular-nums">{l.cnes ?? "—"}</TableCell>
                <TableCell>{l.monitorado ? l.fase : l.situacao}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.monitorado ? l.acoes : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.monitorado ? l.eventos : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtMoeda(l.valor_global)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {l.monitorado ? (
                      <Badge variant="success">Monitorado</Badge>
                    ) : (
                      <Badge variant="warning">A incluir</Badge>
                    )}
                    {l.sem_registro && (
                      <Badge variant="destructive">Sem registro</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {l.monitorado ? (
                    <Link
                      className={botaoIcone}
                      aria-label={`Abrir instrumento ${l.numero}`}
                      title="Abrir instrumento"
                      to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(l.numero)}`}
                    >
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <AdicionarMonitoramentoButton
                      rotulo="Incluir no monitoramento"
                      somenteIcone
                      aoAdicionar={atualizar}
                      dados={{
                        nr_convenio: l.numero,
                        cnpj_convenente: l.cnpj_convenente ?? "",
                        nome_convenente: l.convenente ?? "",
                        tipo_contratacao: l.tipo_contratacao ?? "Convênio",
                        municipio: l.municipio,
                        uf: l.uf,
                        referencia: `convênio ${l.numero}`,
                        descricao: `${l.convenente ?? ""} — ${l.municipio ?? ""}/${l.uf ?? ""}`,
                      }}
                    />
                  )}
                </TableCell>
              </TableRow>
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
    </PainelSecao>
  );
}
