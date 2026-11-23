import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { normalizarTexto } from "@/utils/texto";
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
  | "atrasadas"
  | "ultimo";
const PASSO = 25;

function valorOrdem(l: LinhaCarteira, c: Chave): string | number {
  if (c === "valor") return l.valor_global ?? -1;
  if (c === "atrasadas") return l.acoes_atrasadas;
  if (c === "ultimo") return l.ultimo_lancamento ?? "";
  if (c === "municipio") return `${l.uf ?? ""} ${l.municipio ?? ""}`;
  if (c === "situacao") return l.situacao ?? "";
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
            `${l.numero} ${l.municipio ?? ""} ${l.uf ?? ""} ${l.convenente ?? ""} ${l.titular ?? ""}`,
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
          placeholder="Buscar convênio, município ou convenente"
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
          <TableHeader>
            <TableRow>
              {cab("numero", "Convênio")}
              {cab("municipio", "Município")}
              <TableHead>Convenente</TableHead>
              {cab("situacao", "Situação")}
              <TableHead>Monitoramento</TableHead>
              {cab("atrasadas", "Ações atrasadas", "right")}
              {cab("ultimo", "Último lançamento")}
              {cab("valor", "Valor global", "right")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.slice(0, visiveis).map((l) => (
              <TableRow key={l.numero}>
                <TableCell className="font-medium">
                  {l.monitorado ? (
                    <Link
                      className="text-primary hover:underline"
                      to={`/monitoramento-equipamentos/instrumentos/${encodeURIComponent(l.numero)}`}
                    >
                      {l.numero}
                    </Link>
                  ) : (
                    l.numero
                  )}
                </TableCell>
                <TableCell>
                  {[l.municipio, l.uf].filter(Boolean).join(" / ")}
                </TableCell>
                <TableCell className="max-w-56 truncate">
                  {l.convenente}
                </TableCell>
                <TableCell>{l.situacao}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {l.monitorado ? (
                      <Badge variant="success">No monitoramento</Badge>
                    ) : (
                      <Badge variant={l.em_aberto ? "warning" : "outline"}>
                        {l.em_aberto ? "Falta incluir" : "Não incluído"}
                      </Badge>
                    )}
                    {l.sem_registro && (
                      <Badge variant="destructive">Sem registro</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.acoes_atrasadas || "—"}
                </TableCell>
                <TableCell>
                  {l.ultimo_lancamento
                    ? new Date(l.ultimo_lancamento).toLocaleDateString("pt-BR")
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtMoeda(l.valor_global)}
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
