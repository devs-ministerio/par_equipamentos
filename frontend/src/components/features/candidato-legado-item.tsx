import { Badge } from "@/components/ui/badge";
import { CLASSES_SITUACAO, ROTULOS_SITUACAO } from "@/lib/legado-rotulos";
import { fmtData, fmtMoeda } from "@/lib/monitoramento-format";
import type { CandidatoLegado } from "@/services/candidatos-legados";
import { estiloCard } from "./monitoramento-ui";
import type { ReactNode } from "react";

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{valor}</dd>
    </div>
  );
}

/** Só o que a equipe precisa para decidir: componente, item, valor, local e datas. */
export function CandidatoLegadoItem({
  candidato,
  children,
}: {
  candidato: CandidatoLegado;
  children?: ReactNode;
}) {
  const equipamentos = [...new Set(candidato.evidencias.map((e) => e.nome))];
  const componentes = [
    ...new Set(candidato.componentes.map((c) => c.componente)),
  ];
  return (
    <li
      className={`${estiloCard} min-w-0 border-l-[3px] border-l-primary [overflow-wrap:anywhere]`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-tight">
          Convênio {candidato.numero}
        </h3>
        <Badge
          variant="outline"
          className={`max-w-full whitespace-normal text-xs ${CLASSES_SITUACAO[candidato.situacao]}`}
        >
          {ROTULOS_SITUACAO[candidato.situacao]}
        </Badge>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <Campo rotulo="Componente" valor={componentes.join(" · ") || "—"} />
        <Campo rotulo="Item" valor={equipamentos.join(" · ") || "—"} />
        <Campo rotulo="Valor" valor={fmtMoeda(candidato.valor_global)} />
        <Campo rotulo="UF" valor={candidato.uf ?? "—"} />
        <Campo rotulo="Município" valor={candidato.municipio ?? "—"} />
        <Campo
          rotulo="Data do instrumento"
          valor={fmtData(candidato.data_instrumento)}
        />
        <Campo
          rotulo="Data da coleta"
          valor={fmtData(candidato.verificado_em)}
        />
      </dl>
      {children}
    </li>
  );
}
