import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { botaoIcone } from "@/components/features/equipamentos-instrumento-unidades";
import { AdicionarMonitoramentoButton } from "@/components/features/adicionar-monitoramento-button";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { capitalizarNome } from "@/utils/texto";
import { entrouNoRadarRecente } from "@/lib/painel-tecnico-filtro";
import type { LinhaCarteira } from "@/services/painel-tecnico";

const VARIANTE_FASE: Record<
  string,
  "default" | "secondary" | "success" | "warning" | "outline"
> = {
  "Acompanhamento iniciado": "outline",
  "Aguardando repasse": "warning",
  "Valor repassado": "secondary",
  "Em aquisição": "secondary",
  "Equipamento entregue": "default",
  "Pós-entrega": "default",
  Concluído: "success",
};

/** Uma linha da carteira: situação, contagens, valor, marcador de monitoramento e ação. */
export function PainelTecnicoCarteiraLinha({
  l,
  aoAtualizar,
}: {
  l: LinhaCarteira;
  aoAtualizar: () => void;
}) {
  return (
    <TableRow key={l.numero} className="hover:bg-muted/40">
      <TableCell className="font-medium">{l.numero}</TableCell>
      <TableCell>
        {[l.municipio ? capitalizarNome(l.municipio) : null, l.uf]
          .filter(Boolean)
          .join(" / ")}
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {l.cnes ?? "—"}
      </TableCell>
      <TableCell>
        {l.monitorado ? (
          <Badge variant={VARIANTE_FASE[l.fase ?? ""] ?? "secondary"}>
            {l.fase}
          </Badge>
        ) : (
          <span className="text-muted-foreground">{l.situacao}</span>
        )}
      </TableCell>
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
        <div className="flex flex-wrap items-center justify-center gap-1">
          {entrouNoRadarRecente(l) ? (
            <Badge variant="success">Novo</Badge>
          ) : (
            <>
              {l.monitorado ? (
                <Badge variant="success">Monitorado</Badge>
              ) : (
                <Badge variant="warning">A incluir</Badge>
              )}
              {l.sem_registro && (
                <Badge variant="destructive">Sem registro</Badge>
              )}
            </>
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
            aoAdicionar={aoAtualizar}
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
  );
}
