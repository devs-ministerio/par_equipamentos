import { Badge } from "@/components/ui/badge";
import { CLASSES_SITUACAO, ROTULOS_SITUACAO } from "@/lib/legado-rotulos";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { CandidatoLegadoItensDialog } from "./candidato-legado-itens-dialog";
import { estiloCard } from "./monitoramento-ui";
import type { ReactNode } from "react";

const MS_DIA = 86_400_000;

function diasDesde(iso: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / MS_DIA),
  );
}

/** Pendente do Portal: o candidato já aparece, mas só aprova depois da confirmação. */
function PortalPendente({ candidato }: { candidato: CandidatoLegado }) {
  const aberta =
    candidato.situacao === "novo" || candidato.situacao === "em_analise";
  if (!aberta || candidato.confirmacao_portal === "confirmado") return null;
  const dias = diasDesde(candidato.descoberto_em);
  return (
    <Badge
      variant="outline"
      className="max-w-full whitespace-normal border-warning/25 bg-warning/10 text-xs text-warning"
    >
      Portal pendente ·{" "}
      {dias === 0 ? "hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`}
    </Badge>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{valor}</dd>
    </div>
  );
}

/** Só o que a equipe precisa para decidir: componente, valor, local e datas. */
export function CandidatoLegadoItem({
  candidato,
  children,
}: {
  candidato: CandidatoLegado;
  children?: ReactNode;
}) {
  const componentes = [
    ...new Set(candidato.componentes.map((c) => c.componente)),
  ];
  return (
    <li
      className={`${estiloCard} min-w-0 border-l-[3px] border-l-primary [overflow-wrap:anywhere]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-semibold tracking-tight">
            Convênio {candidato.numero}
          </h3>
          <CandidatoLegadoItensDialog candidato={candidato} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {candidato.numero_processo ? (
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal text-xs"
            >
              Processo · {candidato.numero_processo}
            </Badge>
          ) : null}
          <PortalPendente candidato={candidato} />
          <Badge
            variant="outline"
            className={`max-w-full whitespace-normal text-xs ${CLASSES_SITUACAO[candidato.situacao]}`}
          >
            {ROTULOS_SITUACAO[candidato.situacao]}
          </Badge>
        </div>
      </div>
      <dl className="mt-3 space-y-2">
        <Campo rotulo="Componente" valor={componentes.join(" · ") || "—"} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          <Campo rotulo="Valor" valor={fmtMoeda(candidato.valor_global)} />
          <Campo rotulo="UF" valor={candidato.uf ?? "—"} />
          <Campo rotulo="Município" valor={candidato.municipio ?? "—"} />
          <Campo
            rotulo="Data do instrumento"
            valor={fmtData(candidato.data_instrumento)}
          />
          <Campo
            rotulo="Descoberto em"
            valor={fmtData(candidato.descoberto_em)}
          />
          <Campo rotulo="Recaptura" valor={fmtData(candidato.recaptura_em)} />
        </div>
      </dl>
      {children}
    </li>
  );
}
